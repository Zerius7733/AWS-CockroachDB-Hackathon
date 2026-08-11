import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmbedding, extractResume, searchJobs } from '../agent/openai.js'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.OPENAI_API_KEY
const originalModel = process.env.OPENAI_MODEL
const originalEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalApiKey
  if (originalModel === undefined) delete process.env.OPENAI_MODEL
  else process.env.OPENAI_MODEL = originalModel
  if (originalEmbeddingModel === undefined) delete process.env.OPENAI_EMBEDDING_MODEL
  else process.env.OPENAI_EMBEDDING_MODEL = originalEmbeddingModel
})

test('resume extraction sends a PDF to the Responses API with strict structured output', async () => {
  process.env.OPENAI_API_KEY = 'test-key'
  delete process.env.OPENAI_MODEL
  let request
  const profile = { summary: 'Platform engineer', targetRoles: ['Platform Engineer'], yearsExperience: 4, memories: [] }
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) }
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(profile) }] }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  assert.deepEqual(await extractResume({ filename: 'resume.pdf', mimeType: 'application/pdf', base64: 'dGVzdA==' }), profile)
  assert.equal(request.url, 'https://api.openai.com/v1/responses')
  assert.equal(request.body.model, 'gpt-5.6-terra')
  assert.equal(request.body.store, false)
  assert.equal(request.body.input[0].content[0].type, 'input_file')
  assert.equal(request.body.input[0].content[0].file_data, 'data:application/pdf;base64,dGVzdA==')
  assert.equal(request.body.text.format.type, 'json_schema')
  assert.equal(request.body.text.format.strict, true)
})

test('embedding requests use the model matching the CockroachDB vector width', async () => {
  process.env.OPENAI_API_KEY = 'test-key'
  delete process.env.OPENAI_EMBEDDING_MODEL
  let body
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body)
    return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  assert.deepEqual(await createEmbedding('distributed systems'), [[0.1, 0.2]])
  assert.equal(body.model, 'text-embedding-3-small')
  assert.deepEqual(body.input, ['distributed systems'])
})

test('job search requires an API key before making a request', async () => {
  delete process.env.OPENAI_API_KEY
  globalThis.fetch = async () => { throw new Error('fetch should not be called') }
  await assert.rejects(
    searchJobs({ profile: null, memories: [], location: '', workMode: 'any' }),
    /OPENAI_API_KEY is not configured/,
  )
})

test('job search uses live web search and returns only public job URLs', async () => {
  process.env.OPENAI_API_KEY = 'test-key'
  let body
  const result = {
    searchSummary: 'Found current platform roles.',
    jobs: [
      { title: 'Platform Engineer', company: 'Example', location: 'Remote', workMode: 'remote', employmentType: 'Full-time', url: 'https://example.com/jobs/123', source: 'Example Careers', postedAt: 'Today', score: 91, matchLevel: 'excellent', reason: 'Strong platform background.', matchedSkills: ['SQL'] },
      { title: 'Invalid', company: 'Example', location: 'Remote', workMode: 'remote', employmentType: 'Full-time', url: 'javascript:alert(1)', source: 'Unknown', postedAt: 'Unknown', score: 20, matchLevel: 'stretch', reason: 'Invalid URL.', matchedSkills: [] },
    ],
  }
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body)
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await searchJobs({
    profile: { summary: 'Platform engineer', targetRoles: ['Platform Engineer'], yearsExperience: 4 },
    memories: [{ category: 'skill', title: 'SQL', content: 'Built SQL automation.' }],
    location: 'Singapore',
    workMode: 'remote',
  })

  assert.equal(body.tools[0].type, 'web_search')
  assert.equal(body.tool_choice, 'required')
  assert.deepEqual(body.include, ['web_search_call.action.sources'])
  assert.equal(body.text.format.name, 'northstar_job_search')
  assert.equal(response.jobs.length, 1)
  assert.equal(response.jobs[0].url, 'https://example.com/jobs/123')
})
