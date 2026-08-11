import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { applicationFields } from './csv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql')
const maxTransactionAttempts = 5
let pool

export const getDatabasePool = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example and add your CockroachDB connection string.')
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
    pool.on('error', (error) => console.error('Unexpected CockroachDB pool error:', error))
  }
  return pool
}

const applicationSelect = `
  id, company, role, employment_type AS "type", location, status,
  COALESCE(applied_date::TEXT, '') AS "appliedDate",
  next_step AS "nextStep", COALESCE(next_date::TEXT, '') AS "nextDate",
  source, salary, url, notes
`

const applicationColumns = {
  company: 'company', role: 'role', type: 'employment_type', location: 'location', status: 'status',
  appliedDate: 'applied_date', nextStep: 'next_step', nextDate: 'next_date', source: 'source',
  salary: 'salary', url: 'url', notes: 'notes',
}

const databaseValue = (field, value) => {
  const normalized = String(value ?? '').trim()
  return field === 'appliedDate' || field === 'nextDate' ? normalized || null : normalized
}

export const withDatabaseTransaction = async (operation) => {
  for (let attempt = 1; attempt <= maxTransactionAttempts; attempt += 1) {
    const client = await getDatabasePool().connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      client.release()
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      client.release()
      if (error.code !== '40001' || attempt === maxTransactionAttempts) throw error
    }
  }
}

export const initializeDatabase = async () => {
  const schema = await fs.readFile(schemaPath, 'utf8')
  await getDatabasePool().query(schema)
  await runSchemaChange('UPDATE applications SET user_id = $1 WHERE user_id IS NULL', ['demo-user'])
  await runSchemaChange('ALTER TABLE applications ALTER COLUMN user_id SET NOT NULL')
  await runSchemaChange(
    `INSERT INTO user_profiles (user_id, first_name, last_name, email, role, location, created_at, updated_at)
     SELECT 'demo-user', first_name, last_name, email, role, location, created_at, updated_at
     FROM profiles WHERE workspace_id = 'default' ON CONFLICT (user_id) DO NOTHING`,
  )
}

const runSchemaChange = async (sql, values = []) => {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    try { return await getDatabasePool().query(sql, values) }
    catch (error) {
      if (!['42P10', '55000'].includes(error.code) || attempt === 120) throw error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}

export const closeDatabase = async () => {
  if (pool) await pool.end()
  pool = undefined
}

export const ensureUser = async ({ id, username = '', email = null, authProvider = 'cognito' }) => {
  if (!id) throw new Error('A verified user id is required')
  const result = await getDatabasePool().query(
    `INSERT INTO users (id, username, email, auth_provider)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       username = CASE WHEN excluded.username = '' THEN users.username ELSE excluded.username END,
       email = COALESCE(excluded.email, users.email),
       auth_provider = excluded.auth_provider,
       updated_at = now()
     RETURNING id, username, email, auth_provider AS "authProvider"`,
    [id, username, email, authProvider],
  )
  return result.rows[0]
}

export const listApplications = async (userId) => {
  const result = await getDatabasePool().query(
    `SELECT ${applicationSelect} FROM applications WHERE user_id = $1 ORDER BY sort_key DESC`, [userId],
  )
  return result.rows
}

export const createApplication = async (userId, input) => {
  const item = Object.fromEntries(applicationFields.map((field) => [field, databaseValue(field, input[field])]))
  item.id = crypto.randomUUID()
  const values = [item.id, userId, ...Object.keys(applicationColumns).map((field) => databaseValue(field, item[field]))]
  const columns = ['id', 'user_id', ...Object.values(applicationColumns)]
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
  const result = await getDatabasePool().query(
    `INSERT INTO applications (${columns.join(', ')}) VALUES (${placeholders}) RETURNING ${applicationSelect}`, values,
  )
  return result.rows[0]
}

export const updateApplication = async (userId, id, input) => {
  const fields = Object.keys(applicationColumns).filter((field) => Object.hasOwn(input, field))
  if (!fields.length) {
    const current = await getDatabasePool().query(
      `SELECT ${applicationSelect} FROM applications WHERE id = $1 AND user_id = $2`, [id, userId],
    )
    return current.rows[0]
  }
  const assignments = fields.map((field, index) => `${applicationColumns[field]} = $${index + 3}`)
  const values = [id, userId, ...fields.map((field) => databaseValue(field, input[field]))]
  const result = await getDatabasePool().query(
    `UPDATE applications SET ${assignments.join(', ')}, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING ${applicationSelect}`, values,
  )
  return result.rows[0]
}

export const deleteApplication = async (userId, id) => {
  const result = await getDatabasePool().query('DELETE FROM applications WHERE id = $1 AND user_id = $2', [id, userId])
  return result.rowCount > 0
}

export const replaceApplications = async (userId, applications) => withDatabaseTransaction(async (client) => {
  await client.query('DELETE FROM applications WHERE user_id = $1', [userId])
  const normalized = applications.map((input) => {
    const item = Object.fromEntries(applicationFields.map((field) => [field, databaseValue(field, input[field])]))
    item.id = item.id || crypto.randomUUID()
    return item
  })
  const columns = ['id', 'user_id', ...Object.values(applicationColumns), 'sort_key']
  const fields = Object.keys(applicationColumns)
  const batchSize = 250
  for (let offset = 0; offset < normalized.length; offset += batchSize) {
    const batch = normalized.slice(offset, offset + batchSize)
    const values = []
    const rows = batch.map((item, batchIndex) => {
      const row = [item.id, userId, ...fields.map((field) => databaseValue(field, item[field])), normalized.length - offset - batchIndex]
      const placeholders = row.map((value) => { values.push(value); return `$${values.length}` })
      return `(${placeholders.join(', ')})`
    })
    await client.query(`INSERT INTO applications (${columns.join(', ')}) VALUES ${rows.join(', ')}`, values)
  }
  return normalized
})

export const getProfile = async (userId) => {
  const result = await getDatabasePool().query(
    `SELECT first_name AS "firstName", last_name AS "lastName", email, role, location
     FROM user_profiles WHERE user_id = $1`, [userId],
  )
  return result.rows[0]
}

export const saveProfile = async (userId, profile) => {
  const values = [userId, profile.firstName, profile.lastName, profile.email, profile.role, profile.location]
  const result = await getDatabasePool().query(
    `INSERT INTO user_profiles (user_id, first_name, last_name, email, role, location)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email,
       role = excluded.role, location = excluded.location, updated_at = now()
     RETURNING first_name AS "firstName", last_name AS "lastName", email, role, location`, values,
  )
  return result.rows[0]
}
