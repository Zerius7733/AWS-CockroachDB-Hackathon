import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { applicationFields } from './csv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql')
const workspaceId = 'default'
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
  id,
  company,
  role,
  employment_type AS "type",
  location,
  status,
  COALESCE(applied_date::TEXT, '') AS "appliedDate",
  next_step AS "nextStep",
  COALESCE(next_date::TEXT, '') AS "nextDate",
  source,
  salary,
  url,
  notes
`

const applicationColumns = {
  company: 'company',
  role: 'role',
  type: 'employment_type',
  location: 'location',
  status: 'status',
  appliedDate: 'applied_date',
  nextStep: 'next_step',
  nextDate: 'next_date',
  source: 'source',
  salary: 'salary',
  url: 'url',
  notes: 'notes',
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
}

export const closeDatabase = async () => {
  if (pool) await pool.end()
  pool = undefined
}

export const listApplications = async () => {
  const result = await getDatabasePool().query(`SELECT ${applicationSelect} FROM applications ORDER BY sort_key DESC`)
  return result.rows
}

export const createApplication = async (input) => {
  const item = Object.fromEntries(applicationFields.map((field) => [field, databaseValue(field, input[field])]))
  item.id = crypto.randomUUID()
  const values = [item.id, ...Object.keys(applicationColumns).map((field) => databaseValue(field, item[field]))]
  const columns = ['id', ...Object.values(applicationColumns)]
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
  const result = await getDatabasePool().query(
    `INSERT INTO applications (${columns.join(', ')}) VALUES (${placeholders}) RETURNING ${applicationSelect}`,
    values,
  )
  return result.rows[0]
}

export const updateApplication = async (id, input) => {
  const fields = Object.keys(applicationColumns).filter((field) => Object.hasOwn(input, field))
  if (!fields.length) {
    const current = await getDatabasePool().query(`SELECT ${applicationSelect} FROM applications WHERE id = $1`, [id])
    return current.rows[0]
  }

  const assignments = fields.map((field, index) => `${applicationColumns[field]} = $${index + 2}`)
  const values = [id, ...fields.map((field) => databaseValue(field, input[field]))]
  const result = await getDatabasePool().query(
    `UPDATE applications SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${applicationSelect}`,
    values,
  )
  return result.rows[0]
}

export const deleteApplication = async (id) => {
  const result = await getDatabasePool().query('DELETE FROM applications WHERE id = $1', [id])
  return result.rowCount > 0
}

export const replaceApplications = async (applications) => withDatabaseTransaction(async (client) => {
  await client.query('DELETE FROM applications')
  const normalized = applications.map((input) => {
    const item = Object.fromEntries(applicationFields.map((field) => [field, databaseValue(field, input[field])]))
    item.id = item.id || crypto.randomUUID()
    return item
  })

  const columns = ['id', ...Object.values(applicationColumns), 'sort_key']
  const fields = Object.keys(applicationColumns)
  const batchSize = 250
  for (let offset = 0; offset < normalized.length; offset += batchSize) {
    const batch = normalized.slice(offset, offset + batchSize)
    const values = []
    const rows = batch.map((item, batchIndex) => {
      const row = [item.id, ...fields.map((field) => databaseValue(field, item[field])), normalized.length - offset - batchIndex]
      const placeholders = row.map((value) => { values.push(value); return `$${values.length}` })
      return `(${placeholders.join(', ')})`
    })
    await client.query(`INSERT INTO applications (${columns.join(', ')}) VALUES ${rows.join(', ')}`, values)
  }
  return normalized
})

export const getProfile = async () => {
  const result = await getDatabasePool().query(
    `SELECT first_name AS "firstName", last_name AS "lastName", email, role, location FROM profiles WHERE workspace_id = $1`,
    [workspaceId],
  )
  return result.rows[0]
}

export const saveProfile = async (profile) => {
  const values = [workspaceId, profile.firstName, profile.lastName, profile.email, profile.role, profile.location]
  const result = await getDatabasePool().query(
    `INSERT INTO profiles (workspace_id, first_name, last_name, email, role, location)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id) DO UPDATE SET
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       email = excluded.email,
       role = excluded.role,
       location = excluded.location,
       updated_at = now()
     RETURNING first_name AS "firstName", last_name AS "lastName", email, role, location`,
    values,
  )
  return result.rows[0]
}
