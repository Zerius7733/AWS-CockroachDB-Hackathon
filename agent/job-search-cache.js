import { createHash } from 'node:crypto'
import { getDatabasePool } from '../lib/database.js'

const localCache = new Map()
const minute = 60_000
const JOB_SEARCH_STRATEGY_VERSION = 3

export const jobSearchFreshnessMinutes = () => {
  const configured = Number(process.env.JOB_SEARCH_CACHE_MINUTES || 60)
  if (!Number.isFinite(configured)) return 60
  return Math.min(1_440, Math.max(5, Math.round(configured)))
}

export const jobSearchCacheKey = ({ profile, memories, feedback = [], location, workMode }) => createHash('sha256')
  .update(JSON.stringify({
    strategyVersion: JOB_SEARCH_STRATEGY_VERSION,
    location: String(location || '').trim().toLowerCase(),
    workMode: String(workMode || 'any').trim().toLowerCase(),
    profile: profile ? {
      summary: profile.summary,
      targetRoles: profile.targetRoles,
      yearsExperience: profile.yearsExperience,
      updatedAt: profile.updatedAt,
    } : null,
    memories: memories.map(({ id, category, title, content, verified, createdAt }) => ({ id, category, title, content, verified, createdAt })),
    feedback: feedback.map(({ jobUrl, feedbackType, jobTitle, company, location: jobLocation, updatedAt }) => ({
      jobUrl, feedbackType, jobTitle, company, location: jobLocation, updatedAt,
    })),
  }))
  .digest('hex')

const cacheEnvelope = ({ result, createdAt, freshnessMinutes }) => ({
  result,
  createdAt: new Date(createdAt).toISOString(),
  freshUntil: new Date(new Date(createdAt).getTime() + freshnessMinutes * minute).toISOString(),
})

export const getCachedJobSearch = async (userId, searchKey, freshnessMinutes = jobSearchFreshnessMinutes()) => {
  if (!process.env.DATABASE_URL) {
    const entry = localCache.get(`${userId}:${searchKey}`)
    if (!entry || Date.now() - entry.createdAt >= freshnessMinutes * minute) return null
    return cacheEnvelope({ ...entry, freshnessMinutes })
  }
  const result = await getDatabasePool().query(
    `SELECT result, created_at AS "createdAt"
     FROM candidate_job_search_cache
     WHERE user_id = $1 AND search_key = $2
       AND created_at >= now() - ($3::INT8 * interval '1 minute')`,
    [userId, searchKey, freshnessMinutes],
  )
  return result.rows[0] ? cacheEnvelope({ ...result.rows[0], freshnessMinutes }) : null
}

export const saveJobSearchCache = async (userId, searchKey, result, database) => {
  const freshnessMinutes = jobSearchFreshnessMinutes()
  if (!process.env.DATABASE_URL) {
    const entry = { result, createdAt: Date.now() }
    localCache.set(`${userId}:${searchKey}`, entry)
    return cacheEnvelope({ ...entry, freshnessMinutes })
  }
  const saved = await (database || getDatabasePool()).query(
    `UPSERT INTO candidate_job_search_cache (user_id, search_key, result, created_at)
     VALUES ($1, $2, $3::JSONB, now())
     RETURNING result, created_at AS "createdAt"`,
    [userId, searchKey, JSON.stringify(result)],
  )
  return cacheEnvelope({ ...saved.rows[0], freshnessMinutes })
}

export const invalidateJobSearchCache = async (userId, database = process.env.DATABASE_URL ? getDatabasePool() : null) => {
  if (database) {
    await database.query('DELETE FROM candidate_job_search_cache WHERE user_id = $1', [userId])
    return
  }
  for (const key of localCache.keys()) if (key.startsWith(`${userId}:`)) localCache.delete(key)
}
