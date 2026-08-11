import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDatabasePool, withDatabaseTransaction } from '../lib/database.js'
import { invalidateJobSearchCache } from './job-search-cache.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localPath = path.join(__dirname, '..', 'data', 'memory.json')
const schemaPath = path.join(__dirname, '..', 'db', 'memory.sql')
let initialization

const vectorLiteral = (embedding) => `[${embedding.join(',')}]`

export const initializeMemoryStore = async () => {
  if (!process.env.DATABASE_URL) return null
  const pool = getDatabasePool()
  if (!initialization) {
    initialization = fs.readFile(schemaPath, 'utf8')
      .then((schema) => pool.query(schema))
      .catch((error) => {
        initialization = undefined
        throw error
      })
  }
  await initialization
  return pool
}

export const getMemoryDatabase = async () => {
  if (!process.env.DATABASE_URL) return null
  if (process.env.RUN_DB_MIGRATIONS !== 'false') return initializeMemoryStore()
  return getDatabasePool()
}

const getPool = getMemoryDatabase

const readLocal = async () => {
  try {
    const data = JSON.parse(await fs.readFile(localPath, 'utf8'))
    if (data.users) return data
    return { users: { 'demo-user': { profile: data.profile || null, memories: data.memories || [] } } }
  } catch (error) { if (error.code === 'ENOENT') return { users: {} }; throw error }
}

const writeLocal = async (data) => {
  await fs.mkdir(path.dirname(localPath), { recursive: true })
  const temporary = `${localPath}.tmp`
  await fs.writeFile(temporary, JSON.stringify(data, null, 2))
  await fs.rename(temporary, localPath)
}

export const storageMode = () => process.env.DATABASE_URL ? 'cockroachdb' : 'local-demo'

const localUserData = (data, userId) => data.users[userId] || { profile: null, memories: [] }

export const listMemories = async (userId) => {
  const database = await getPool()
  if (!database) return localUserData(await readLocal(), userId).memories.map(({ embedding: _embedding, ...item }) => item)
  const result = await database.query(
    `SELECT id, category, title, content, source_name AS "sourceName", confidence::FLOAT8, verified, created_at AS "createdAt"
     FROM candidate_memories WHERE user_id = $1 ORDER BY created_at DESC`, [userId],
  )
  return result.rows
}

export const getCareerContext = async (userId) => {
  const database = await getPool()
  if (!database) {
    const user = localUserData(await readLocal(), userId)
    return {
      profile: user.profile,
      memories: user.memories.map(({ embedding: _embedding, ...item }) => item),
    }
  }
  const [profileResult, memories] = await Promise.all([
    database.query(
      `SELECT summary, target_roles AS "targetRoles", years_experience::FLOAT8 AS "yearsExperience",
              source_name AS "sourceName", updated_at AS "updatedAt"
       FROM candidate_profiles WHERE user_id = $1`,
      [userId],
    ),
    listMemories(userId),
  ])
  return { profile: profileResult.rows[0] || null, memories }
}

export const saveResumeMemories = async (userId, { profile, memories, embeddings, sourceName }) => {
  const now = new Date().toISOString()
  const records = memories.map((item, index) => ({
    ...item, id: crypto.randomUUID(), sourceName, verified: false, createdAt: now, embedding: embeddings[index],
  }))
  const database = await getPool()
  if (!database) {
    const current = await readLocal()
    await writeLocal({ users: { ...current.users, [userId]: { profile, memories: records } } })
    await invalidateJobSearchCache(userId)
    return records.map(({ embedding: _embedding, ...item }) => item)
  }

  await withDatabaseTransaction(async (client) => {
    await client.query(
      `UPSERT INTO candidate_profiles (user_id, summary, target_roles, years_experience, source_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [userId, profile.summary, profile.targetRoles, profile.yearsExperience, sourceName],
    )
    await client.query('DELETE FROM candidate_memories WHERE user_id = $1', [userId])
    await invalidateJobSearchCache(userId, client)
    for (const item of records) {
      await client.query(
        `INSERT INTO candidate_memories
          (id, user_id, category, title, content, source_name, confidence, verified, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::VECTOR)`,
        [item.id, userId, item.category, item.title, item.content, sourceName, item.confidence, false, vectorLiteral(item.embedding)],
      )
    }
  })
  return records.map(({ embedding: _embedding, ...item }) => item)
}

export const searchMemories = async (userId, embedding, limit = 12) => {
  const database = await getPool()
  if (!database) return localUserData(await readLocal(), userId).memories.slice(0, limit)
  const result = await database.query(
    `SELECT id, category, title, content, source_name AS "sourceName", confidence::FLOAT8, verified,
            1 - (embedding <=> $2::VECTOR) AS similarity
     FROM candidate_memories
     WHERE user_id = $1
     ORDER BY embedding <=> $2::VECTOR
     LIMIT $3`,
    [userId, vectorLiteral(embedding), limit],
  )
  return result.rows
}

export const deleteMemory = async (userId, id) => {
  const database = await getPool()
  if (!database) {
    const current = await readLocal()
    const user = localUserData(current, userId)
    const next = user.memories.filter((item) => item.id !== id)
    if (next.length === user.memories.length) return false
    await writeLocal({ users: { ...current.users, [userId]: { ...user, memories: next } } })
    await invalidateJobSearchCache(userId)
    return true
  }
  return withDatabaseTransaction(async (client) => {
    const result = await client.query('DELETE FROM candidate_memories WHERE id = $1 AND user_id = $2', [id, userId])
    if (result.rowCount) await invalidateJobSearchCache(userId, client)
    return result.rowCount > 0
  })
}
