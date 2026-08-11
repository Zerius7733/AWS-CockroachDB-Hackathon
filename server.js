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
import { createEmbedding, extractResume, matchJob } from './agent/openai.js'
import { deleteMemory, listMemories, saveResumeMemories, searchMemories, storageMode } from './agent/memory-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultProfile = { firstName: 'Alex', lastName: 'Johnson', email: 'alex.johnson@example.com', role: 'Job seeker', location: 'Singapore' }

const app = express()
app.use(express.json({ limit: '12mb' }))

app.get('/api/applications', async (_req, res) => {
  try { res.json(await listApplications()) }
  catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/profile', async (_req, res) => {
  try { res.json({ ...defaultProfile, ...(await getProfile()) }) }
  catch (error) { res.status(500).json({ error: error.message }) }
})

app.put('/api/profile', async (req, res) => {
  try {
    const profile = Object.fromEntries(profileFields.map((field) => [field, String(req.body[field] || '').trim()]))
    if (!profile.firstName || !profile.lastName || !profile.email) return res.status(400).json({ error: 'First name, last name, and email are required' })
    res.json(await saveProfile(profile))
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.post('/api/applications', async (req, res) => {
  try {
    res.status(201).json(await createApplication(req.body))
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.put('/api/applications/:id', async (req, res) => {
  try {
    const item = await updateApplication(req.params.id, req.body)
    if (!item) return res.status(404).json({ error: 'Application not found' })
    res.json(item)
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.delete('/api/applications/:id', async (req, res) => {
  try {
    if (!await deleteApplication(req.params.id)) return res.status(404).json({ error: 'Application not found' })
    res.status(204).end()
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.post('/api/import', async (req, res) => {
  try {
    const imported = parseCsv(req.body.csv || '').map((item) => ({ ...Object.fromEntries(applicationFields.map((field) => [field, ''])), ...item, id: item.id || crypto.randomUUID() }))
    if (!imported.length) return res.status(400).json({ error: 'No application rows found' })
    res.json(await replaceApplications(imported))
  } catch (error) { res.status(400).json({ error: error.message }) }
})

app.get('/api/export', async (_req, res) => {
  try {
    const applications = await listApplications()
    res.type('text/csv').attachment('northstar-applications.csv').send(toCsv(applications, applicationFields))
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/agent/status', (_req, res) => {
  res.json({
    ready: Boolean(process.env.OPENAI_API_KEY),
    storage: storageMode(),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    cockroachConfigured: Boolean(process.env.DATABASE_URL),
    mcpMode: 'external-client',
  })
})

app.get('/api/memory', async (_req, res) => {
  try { res.json(await listMemories()) }
  catch (error) { res.status(500).json({ error: error.message }) }
})

app.post('/api/memory/resume', async (req, res) => {
  try {
    const { filename, mimeType, base64 } = req.body || {}
    if (!filename || mimeType !== 'application/pdf' || !base64) return res.status(400).json({ error: 'A PDF resume is required' })
    if (base64.length > 10_500_000) return res.status(413).json({ error: 'Resume must be smaller than 7.5 MB' })
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return res.status(400).json({ error: 'Resume data is invalid' })

    const profile = await extractResume({ filename, mimeType, base64 })
    if (!profile.memories.length) return res.status(422).json({ error: 'No career memories could be extracted from this resume' })
    const embeddings = await createEmbedding(profile.memories.map((item) => `${item.title}: ${item.content}`))
    const memories = await saveResumeMemories({ profile, memories: profile.memories, embeddings, sourceName: filename })
    res.status(201).json({ profile, memories, storage: storageMode() })
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.delete('/api/memory/:id', async (req, res) => {
  try {
    const deleted = await deleteMemory(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Memory not found' })
    res.status(204).end()
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.post('/api/agent/match', async (req, res) => {
  try {
    const jobDescription = String(req.body?.jobDescription || '').trim()
    if (jobDescription.length < 80) return res.status(400).json({ error: 'Paste a fuller job description (at least 80 characters)' })
    if (jobDescription.length > 30_000) return res.status(413).json({ error: 'Job description is too long' })
    const [embedding] = await createEmbedding(jobDescription)
    const memories = await searchMemories(embedding)
    if (!memories.length) return res.status(409).json({ error: 'Upload a resume before matching a job' })
    const match = await matchJob({ jobDescription, memories })
    res.json({ ...match, retrievedMemories: memories, storage: storageMode() })
  } catch (error) { res.status(500).json({ error: error.message }) }
})

const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))
app.get(/.*/, (_req, res) => res.sendFile(path.join(distPath, 'index.html')))

const port = process.env.PORT || 3001
initializeDatabase()
  .then(() => app.listen(port, () => console.log(`Northstar is running on http://localhost:${port}`)))
  .catch((error) => {
    console.error('Northstar could not connect to CockroachDB:', error.message)
    process.exitCode = 1
  })
