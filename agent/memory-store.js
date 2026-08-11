import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDatabasePool, withDatabaseTransaction } from '../lib/database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localPath = path.join(__dirname, '..', 'data', 'memory.json')
const schemaPath = path.join(__dirname, '..', 'db', 'memory.sql')
const userId = 'demo-user'
let initialization

const vectorLiteral = (embedding) => `[${embedding.join(',')}]`

const getPool = async () => {
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

const readLocal = async () => {
  try { return JSON.parse(await fs.readFile(localPath, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return { profile: null, memories: [] }; throw error }
}

const writeLocal = async (data) => {
  await fs.mkdir(path.dirname(localPath), { recursive: true })
  const temporary = `${localPath}.tmp`
  await fs.writeFile(temporary, JSON.stringify(data, null, 2))
  await fs.rename(temporary, localPath)
}

export const storageMode = () => process.env.DATABASE_URL ? 'cockroachdb' : 'local-demo'

export const listMemories = async () => {
  const database = await getPool()
  if (!database) return (await readLocal()).memories.map(({ embedding: _embedding, ...item }) => item)
  const result = await database.query(
    `SELECT id, category, title, content, source_name AS "sourceName", confidence::FLOAT8, verified, created_at AS "createdAt"
     FROM candidate_memories WHERE user_id = $1 ORDER BY created_at DESC`, [userId],
  )
  return result.rows
}

export const saveResumeMemories = async ({ profile, memories, embeddings, sourceName }) => {
  const now = new Date().toISOString()
  const records = memories.map((item, index) => ({
    ...item, id: crypto.randomUUID(), sourceName, verified: false, createdAt: now, embedding: embeddings[index],
  }))
  const database = await getPool()
  if (!database) {
    await writeLocal({ profile, memories: records })
    return records.map(({ embedding: _embedding, ...item }) => item)
  }

  await withDatabaseTransaction(async (client) => {
    await client.query(
      `UPSERT INTO candidate_profiles (user_id, summary, target_roles, years_experience, source_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [userId, profile.summary, profile.targetRoles, profile.yearsExperience, sourceName],
    )
    await client.query('DELETE FROM candidate_memories WHERE user_id = $1', [userId])
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

export const searchMemories = async (embedding, limit = 12) => {
  const database = await getPool()
  if (!database) return (await readLocal()).memories.slice(0, limit)
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

export const deleteMemory = async (id) => {
  const database = await getPool()
  if (!database) {
    const current = await readLocal()
    const next = current.memories.filter((item) => item.id !== id)
    if (next.length === current.memories.length) return false
    await writeLocal({ ...current, memories: next })
    return true
  }
  const result = await database.query('DELETE FROM candidate_memories WHERE id = $1 AND user_id = $2', [id, userId])
  return result.rowCount > 0
}
