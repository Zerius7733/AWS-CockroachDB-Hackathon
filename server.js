import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationFields, parseCsv, profileFields, toCsv } from './lib/csv.js'
import {
  createApplication,
  deleteApplication,
  getProfile,
  initializeDatabase,
  listApplications,
  replaceApplications,
  saveProfile,
  updateApplication,
} from './lib/database.js'
import { createEmbedding, extractResume, searchJobs } from './agent/openai.js'
import { deleteMemory, getCareerContext, listMemories, saveResumeMemories, storageMode } from './agent/memory-store.js'
import { retrieveJobSearchMemories } from './agent/job-memory-retrieval.js'
import { getCachedJobSearch, jobSearchCacheKey, jobSearchFreshnessMinutes, saveJobSearchCache } from './agent/job-search-cache.js'
import { deleteJobFeedback, listJobFeedback, saveJobFeedback } from './agent/job-feedback-store.js'
import { authenticationMode, login, logout, register, requireAuth } from './lib/auth.js'
import { installProcessErrorLogging, logError, logInfo, requestLogger, sendError } from './lib/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultProfile = { firstName: 'Alex', lastName: 'Johnson', email: 'alex.johnson@example.com', role: 'Job seeker', location: 'Singapore' }

const app = express()
installProcessErrorLogging()
app.set('trust proxy', 1)
app.use(requestLogger)
app.use(express.json({ limit: '12mb' }))
app.get('/health', (_req, res) => res.json({ ok: true }))

const authEndpoint = (handler) => async (req, res) => {
  try { await handler(req, res) }
  catch (error) { sendError(req, res, error) }
}

app.post('/api/auth/register', authEndpoint(register))
app.post('/api/auth/login', authEndpoint(login))
app.post('/api/auth/logout', authEndpoint(logout))
app.use('/api', requireAuth)

app.get('/api/auth/me', (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, email: req.user.email, mode: req.user.mode })
})

app.get('/api/applications', async (req, res) => {
  try { res.json(await listApplications(req.user.id)) }
  catch (error) { sendError(req, res, error) }
})

app.get('/api/profile', async (req, res) => {
  try {
    const fallback = req.user.mode === 'development' ? defaultProfile : { firstName: req.user.username || '', lastName: '', email: req.user.email || '', role: 'Job seeker', location: '' }
    res.json({ ...fallback, ...(await getProfile(req.user.id)) })
  }
  catch (error) { sendError(req, res, error) }
})

app.put('/api/profile', async (req, res) => {
  try {
    const profile = Object.fromEntries(profileFields.map((field) => [field, String(req.body[field] || '').trim()]))
    if (!profile.firstName || !profile.lastName || !profile.email) return res.status(400).json({ error: 'First name, last name, and email are required' })
    res.json(await saveProfile(req.user.id, profile))
  } catch (error) { sendError(req, res, error) }
})

app.post('/api/applications', async (req, res) => {
  try {
    res.status(201).json(await createApplication(req.user.id, req.body))
  } catch (error) { sendError(req, res, error) }
})

app.put('/api/applications/:id', async (req, res) => {
  try {
    const item = await updateApplication(req.user.id, req.params.id, req.body)
    if (!item) return res.status(404).json({ error: 'Application not found' })
    res.json(item)
  } catch (error) { sendError(req, res, error) }
})

app.delete('/api/applications/:id', async (req, res) => {
  try {
    if (!await deleteApplication(req.user.id, req.params.id)) return res.status(404).json({ error: 'Application not found' })
    res.status(204).end()
  } catch (error) { sendError(req, res, error) }
})

app.post('/api/import', async (req, res) => {
  try {
    const imported = parseCsv(req.body.csv || '').map((item) => ({ ...Object.fromEntries(applicationFields.map((field) => [field, ''])), ...item, id: item.id || crypto.randomUUID() }))
    if (!imported.length) return res.status(400).json({ error: 'No application rows found' })
    res.json(await replaceApplications(req.user.id, imported))
  } catch (error) { sendError(req, res, error, 400) }
})

app.get('/api/export', async (req, res) => {
  try {
    const applications = await listApplications(req.user.id)
    res.type('text/csv').attachment('northstar-applications.csv').send(toCsv(applications, applicationFields))
  } catch (error) { sendError(req, res, error) }
})

app.get('/api/agent/status', (_req, res) => {
  res.json({
    ready: Boolean(process.env.OPENAI_API_KEY),
    storage: storageMode(),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    cockroachConfigured: Boolean(process.env.DATABASE_URL),
    mcpMode: 'external-client',
    authentication: authenticationMode(),
    jobSearchCacheMinutes: jobSearchFreshnessMinutes(),
  })
})

app.get('/api/memory', async (req, res) => {
  try { res.json(await listMemories(req.user.id)) }
  catch (error) { sendError(req, res, error) }
})

app.post('/api/memory/resume', async (req, res) => {
  try {
    const { filename, mimeType, base64 } = req.body || {}
    if (!filename || mimeType !== 'application/pdf' || !base64) return res.status(400).json({ error: 'A PDF resume is required' })
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
    const decodedBytes = Math.floor(base64.length * 3 / 4) - padding
    if (decodedBytes > 4_000_000) return res.status(413).json({ error: 'Resume must be smaller than 4 MB' })
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return res.status(400).json({ error: 'Resume data is invalid' })

    const profile = await extractResume({ filename, mimeType, base64 })
    if (!profile.memories.length) return res.status(422).json({ error: 'No career memories could be extracted from this resume' })
    const embeddings = await createEmbedding(profile.memories.map((item) => `${item.title}: ${item.content}`))
    const memories = await saveResumeMemories(req.user.id, { profile, memories: profile.memories, embeddings, sourceName: filename })
    res.status(201).json({ profile, memories, storage: storageMode() })
  } catch (error) { sendError(req, res, error) }
})

app.delete('/api/memory/:id', async (req, res) => {
  try {
    const deleted = await deleteMemory(req.user.id, req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Memory not found' })
    res.status(204).end()
  } catch (error) { sendError(req, res, error) }
})

app.get('/api/agent/jobs/feedback', async (req, res) => {
  try { res.json(await listJobFeedback(req.user.id)) }
  catch (error) { sendError(req, res, error) }
})

app.put('/api/agent/jobs/feedback', async (req, res) => {
  try { res.json(await saveJobFeedback(req.user.id, req.body?.job, req.body?.feedbackType)) }
  catch (error) { sendError(req, res, error) }
})

app.delete('/api/agent/jobs/feedback', async (req, res) => {
  try {
    if (!await deleteJobFeedback(req.user.id, req.query.url)) return res.status(404).json({ error: 'Job feedback not found' })
    res.status(204).end()
  } catch (error) { sendError(req, res, error) }
})

app.post('/api/agent/jobs', async (req, res) => {
  const startedAt = Date.now()
  let stage = 'validate_input'
  try {
    const location = String(req.body?.location || '').trim().slice(0, 120)
    const workMode = String(req.body?.workMode || 'any').trim().toLowerCase()
    if (!['any', 'remote', 'hybrid', 'on-site'].includes(workMode)) return res.status(400).json({ error: 'Choose a valid work mode' })
    logInfo('job_search_started', { locationProvided: Boolean(location), workMode })
    stage = 'load_context'
    const [{ profile, memories }, feedback] = await Promise.all([
      getCareerContext(req.user.id),
      listJobFeedback(req.user.id),
    ])
    logInfo('job_search_context_loaded', { memoryCount: memories.length, feedbackCount: feedback.length, durationMs: Date.now() - startedAt })
    if (!memories.length) return res.status(409).json({ error: 'Upload a resume before searching for jobs' })
    stage = 'cache_lookup'
    const freshnessMinutes = jobSearchFreshnessMinutes()
    const searchKey = jobSearchCacheKey({ profile, memories, feedback, location, workMode })
    const cached = await getCachedJobSearch(req.user.id, searchKey, freshnessMinutes)
    if (cached) {
      logInfo('job_search_cache_hit', { jobCount: cached.result.jobs?.length || 0, durationMs: Date.now() - startedAt })
      res.set('X-Northstar-Cache', 'HIT')
      return res.json({
        ...cached.result,
        searchedAt: cached.createdAt,
        storage: storageMode(),
        cache: { hit: true, freshnessMinutes, freshUntil: cached.freshUntil },
      })
    }
    stage = 'vector_memory_retrieval'
    const relevantMemories = await retrieveJobSearchMemories({
      userId: req.user.id,
      profile,
      location,
      workMode,
    })
    logInfo('job_search_vector_memory_retrieved', {
      retrievedMemoryCount: relevantMemories.length,
      availableMemoryCount: memories.length,
      durationMs: Date.now() - startedAt,
    })
    stage = 'openai_web_search'
    logInfo('job_search_cache_miss', { durationMs: Date.now() - startedAt })
    const result = await searchJobs({ profile, memories: relevantMemories, feedback, location, workMode })
    stage = 'save_cache'
    const saved = await saveJobSearchCache(req.user.id, searchKey, result)
    logInfo('job_search_completed', { jobCount: result.jobs.length, durationMs: Date.now() - startedAt })
    res.set('X-Northstar-Cache', 'MISS')
    res.json({
      ...result,
      searchedAt: saved.createdAt,
      storage: storageMode(),
      cache: { hit: false, freshnessMinutes, freshUntil: saved.freshUntil },
    })
  } catch (error) { sendError(req, res, error, 500, { operation: 'job_search', stage, durationMs: Date.now() - startedAt }) }
})

const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))
app.get(/.*/, (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
app.use((error, req, res, _next) => sendError(req, res, error, error.type === 'entity.too.large' ? 413 : 500))

const port = process.env.PORT || 3001
const prepareDatabase = process.env.RUN_DB_MIGRATIONS === 'false' ? Promise.resolve() : initializeDatabase()
prepareDatabase
  .then(() => app.listen(port, () => console.log(`Northstar is running on http://localhost:${port}`)))
  .catch((error) => {
    logError('server_start_failed', error)
    process.exitCode = 1
  })
