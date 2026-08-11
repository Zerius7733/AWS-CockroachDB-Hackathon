import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedding, extractResume, matchJob } from './agent/openai.js'
import { deleteMemory, listMemories, saveResumeMemories, searchMemories, storageMode } from './agent/memory-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const csvPath = path.join(dataDir, 'applications.csv')
const profilePath = path.join(dataDir, 'profile.csv')
const fields = ['id', 'company', 'role', 'type', 'location', 'status', 'appliedDate', 'nextStep', 'nextDate', 'source', 'salary', 'url', 'notes']
const profileFields = ['firstName', 'lastName', 'email', 'role', 'location']
const defaultProfile = { firstName: 'Alex', lastName: 'Johnson', email: 'alex.johnson@example.com', role: 'Job seeker', location: 'Singapore' }

const parseCsv = (text) => {
  const rows = []
  let row = [], value = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted && char === '"' && text[i + 1] === '"') { value += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(value); value = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(value); value = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else value += char
  }
  if (value || row.length) { row.push(value); rows.push(row) }
  const [headers = [], ...body] = rows
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

const escapeCell = (value = '') => {
  const string = String(value)
  return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string
}

const toCsv = (rows, columns) => [columns.join(','), ...rows.map((item) => columns.map((field) => escapeCell(item[field])).join(','))].join('\n') + '\n'

const readApplications = async () => {
  try { return parseCsv(await fs.readFile(csvPath, 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeApplications([])
    return []
  }
}
const writeApplications = async (applications) => {
  await fs.mkdir(dataDir, { recursive: true })
  const tempPath = `${csvPath}.tmp`
  await fs.writeFile(tempPath, toCsv(applications, fields), 'utf8')
  await fs.rename(tempPath, csvPath)
}
const readProfile = async () => {
  try {
    const parsed = parseCsv(await fs.readFile(profilePath, 'utf8'))[0] || {}
    const { name, ...storedProfile } = parsed
    if (name && !storedProfile.firstName) {
      const [firstName, ...lastNameParts] = name.trim().split(/\s+/)
      return { ...defaultProfile, ...storedProfile, firstName, lastName: lastNameParts.join(' ') }
    }
    return { ...defaultProfile, ...storedProfile }
  }
  catch (error) { if (error.code === 'ENOENT') return defaultProfile; throw error }
}
const writeProfile = async (profile) => {
  await fs.mkdir(dataDir, { recursive: true })
  const tempPath = `${profilePath}.tmp`
  await fs.writeFile(tempPath, toCsv([profile], profileFields), 'utf8')
  await fs.rename(tempPath, profilePath)
}

const app = express()
app.use(express.json({ limit: '12mb' }))

app.get('/api/applications', async (_req, res) => {
  try { res.json(await readApplications()) }
  catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/profile', async (_req, res) => {
  try { res.json(await readProfile()) }
  catch (error) { res.status(500).json({ error: error.message }) }
})

app.put('/api/profile', async (req, res) => {
  try {
    const profile = Object.fromEntries(profileFields.map((field) => [field, String(req.body[field] || '').trim()]))
    if (!profile.firstName || !profile.lastName || !profile.email) return res.status(400).json({ error: 'First name, last name, and email are required' })
    await writeProfile(profile)
    res.json(profile)
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.post('/api/applications', async (req, res) => {
  try {
    const applications = await readApplications()
    const item = { ...Object.fromEntries(fields.map((field) => [field, ''])), ...req.body, id: crypto.randomUUID() }
    await writeApplications([item, ...applications])
    res.status(201).json(item)
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.put('/api/applications/:id', async (req, res) => {
  try {
    const applications = await readApplications()
    const index = applications.findIndex((item) => item.id === req.params.id)
    if (index === -1) return res.status(404).json({ error: 'Application not found' })
    applications[index] = { ...applications[index], ...req.body, id: req.params.id }
    await writeApplications(applications)
    res.json(applications[index])
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.delete('/api/applications/:id', async (req, res) => {
  try {
    const applications = await readApplications()
    await writeApplications(applications.filter((item) => item.id !== req.params.id))
    res.status(204).end()
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.post('/api/import', async (req, res) => {
  try {
    const imported = parseCsv(req.body.csv || '').map((item) => ({ ...Object.fromEntries(fields.map((field) => [field, ''])), ...item, id: item.id || crypto.randomUUID() }))
    if (!imported.length) return res.status(400).json({ error: 'No application rows found' })
    await writeApplications(imported)
    res.json(imported)
  } catch (error) { res.status(400).json({ error: error.message }) }
})

app.get('/api/export', async (_req, res) => {
  try {
    await readApplications()
    res.download(csvPath, 'northstar-applications.csv')
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/agent/status', (_req, res) => {
  res.json({
    ready: Boolean(process.env.OPENAI_API_KEY),
    storage: storageMode(),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    cockroachConfigured: Boolean(process.env.DATABASE_URL),
    mcpConfigured: Boolean(process.env.COCKROACH_CLUSTER_ID && process.env.COCKROACH_MCP_API_KEY),
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
app.listen(port, () => console.log(`Northstar is running on http://localhost:${port}`))
