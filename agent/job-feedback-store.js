import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { invalidateJobSearchCache } from './job-search-cache.js'
import { getMemoryDatabase } from './memory-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localPath = path.join(__dirname, '..', 'data', 'job-feedback.json')

export const JOB_FEEDBACK_TYPES = Object.freeze({
  interested: 'Interested',
  not_interested: 'Not interested',
  applied: 'Applied',
  hide_company: 'Hide company',
  wrong_seniority: 'Wrong seniority',
  wrong_industry: 'Wrong industry',
  poor_location: 'Good match, poor location',
})

export const normalizeJobUrl = (value) => {
  const url = new URL(String(value || '').trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('A valid public job URL is required'), { status: 400 })
  url.hash = ''
  return url.toString()
}

const clean = (value, limit) => String(value || '').trim().slice(0, limit)

export const normalizeJobFeedback = (job, feedbackType) => {
  if (!Object.hasOwn(JOB_FEEDBACK_TYPES, feedbackType)) throw Object.assign(new Error('Choose a valid job feedback action'), { status: 400 })
  const item = {
    jobUrl: normalizeJobUrl(job?.url),
    feedbackType,
    jobTitle: clean(job?.title, 240),
    company: clean(job?.company, 180),
    location: clean(job?.location, 180),
    workMode: clean(job?.workMode || 'unspecified', 40),
    employmentType: clean(job?.employmentType, 80),
  }
  if (!item.jobTitle || !item.company) throw Object.assign(new Error('Job title and company are required'), { status: 400 })
  return item
}

const readLocal = async () => {
  try { return JSON.parse(await fs.readFile(localPath, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return { users: {} }; throw error }
}

const writeLocal = async (data) => {
  await fs.mkdir(path.dirname(localPath), { recursive: true })
  const temporary = `${localPath}.tmp`
  await fs.writeFile(temporary, JSON.stringify(data, null, 2))
  await fs.rename(temporary, localPath)
}

export const listJobFeedback = async (userId, limit = 50) => {
  if (!process.env.DATABASE_URL) {
    const data = await readLocal()
    return (data.users[userId] || []).slice(0, limit)
  }
  const result = await (await getMemoryDatabase()).query(
    `SELECT job_url AS "jobUrl", feedback_type AS "feedbackType", job_title AS "jobTitle",
            company, location, work_mode AS "workMode", employment_type AS "employmentType",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM candidate_job_feedback
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return result.rows
}

export const saveJobFeedback = async (userId, job, feedbackType) => {
  const item = normalizeJobFeedback(job, feedbackType)
  if (!process.env.DATABASE_URL) {
    const data = await readLocal()
    const current = data.users[userId] || []
    const previous = current.find((entry) => entry.jobUrl === item.jobUrl)
    const saved = { ...item, createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
    await writeLocal({ ...data, users: { ...data.users, [userId]: [saved, ...current.filter((entry) => entry.jobUrl !== item.jobUrl)] } })
    await invalidateJobSearchCache(userId)
    return saved
  }
  const database = await getMemoryDatabase()
  const result = await database.query(
    `INSERT INTO candidate_job_feedback
       (user_id, job_url, feedback_type, job_title, company, location, work_mode, employment_type, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (user_id, job_url) DO UPDATE SET
       feedback_type = excluded.feedback_type,
       job_title = excluded.job_title,
       company = excluded.company,
       location = excluded.location,
       work_mode = excluded.work_mode,
       employment_type = excluded.employment_type,
       updated_at = now()
     RETURNING job_url AS "jobUrl", feedback_type AS "feedbackType", job_title AS "jobTitle",
               company, location, work_mode AS "workMode", employment_type AS "employmentType",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [userId, item.jobUrl, item.feedbackType, item.jobTitle, item.company, item.location, item.workMode, item.employmentType],
  )
  await invalidateJobSearchCache(userId, database)
  return result.rows[0]
}

export const deleteJobFeedback = async (userId, value) => {
  const jobUrl = normalizeJobUrl(value)
  if (!process.env.DATABASE_URL) {
    const data = await readLocal()
    const current = data.users[userId] || []
    const next = current.filter((entry) => entry.jobUrl !== jobUrl)
    if (next.length === current.length) return false
    await writeLocal({ ...data, users: { ...data.users, [userId]: next } })
    await invalidateJobSearchCache(userId)
    return true
  }
  const database = await getMemoryDatabase()
  const result = await database.query('DELETE FROM candidate_job_feedback WHERE user_id = $1 AND job_url = $2', [userId, jobUrl])
  if (result.rowCount) await invalidateJobSearchCache(userId, database)
  return result.rowCount > 0
}
