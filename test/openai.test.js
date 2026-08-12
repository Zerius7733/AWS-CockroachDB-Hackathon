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
  let requestCount = 0
  const result = {
    searchSummary: 'Found current platform roles.',
    jobs: [
      { title: 'Platform Engineer', company: 'Example', location: 'Remote', workMode: 'remote', employmentType: 'Full-time', url: 'https://example.com/jobs/123', source: 'Example Careers', postedAt: 'Today', score: 91, matchLevel: 'excellent', reason: 'Strong platform background.', matchedSkills: ['SQL'] },
      { title: 'Invalid', company: 'Example', location: 'Remote', workMode: 'remote', employmentType: 'Full-time', url: 'javascript:alert(1)', source: 'Unknown', postedAt: 'Unknown', score: 20, matchLevel: 'stretch', reason: 'Invalid URL.', matchedSkills: [] },
    ],
  }
  globalThis.fetch = async (_url, options) => {
    requestCount += 1
    body = JSON.parse(options.body)
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await searchJobs({
    profile: { summary: 'Platform engineer', targetRoles: ['Platform Engineer'], yearsExperience: 4 },
    memories: [{ category: 'skill', title: 'SQL', content: 'Built SQL automation.' }],
    feedback: [{ feedbackType: 'wrong_industry', jobTitle: 'Security Analyst', company: 'Example Security', location: 'Singapore', workMode: 'on-site' }],
    location: 'Singapore',
    workMode: 'remote',
    jobType: 'full-time',
  })

  assert.equal(body.tools[0].type, 'web_search')
  assert.equal(body.tool_choice, 'required')
  assert.deepEqual(body.include, ['web_search_call.action.sources'])
  assert.equal(body.text.format.name, 'northstar_job_search')
  assert.match(body.input[1].content, /COCKROACHDB JOB FEEDBACK MEMORY/)
  assert.match(body.input[1].content, /\[wrong_industry\] Security Analyst at Example Security/)
  assert.match(body.input[1].content, /Job type: full-time/)
  assert.match(body.input[1].content, /first pass produced only 1 verified distinct jobs/i)
  assert.equal(requestCount, 2)
  assert.equal(response.jobs.length, 1)
  assert.equal(response.jobs[0].url, 'https://example.com/jobs/123')
})

test('job search expands a short first pass to ten distinct verified jobs', async () => {
  process.env.OPENAI_API_KEY = 'test-key'
  let requestCount = 0
  const job = (id, score = 80) => ({
    title: `Engineer ${id}`, company: `Company ${id}`, location: 'Singapore', workMode: 'hybrid',
    employmentType: 'Full-time', url: `https://example.com/jobs/${id}`, source: 'Example Careers',
    postedAt: 'Today', score, matchLevel: 'strong', reason: 'Relevant experience.', matchedSkills: ['Python'],
  })
  globalThis.fetch = async () => {
    requestCount += 1
    const jobs = requestCount === 1
      ? Array.from({ length: 7 }, (_, index) => job(index + 1, 80 + index))
      : [job(7), job(8, 96), job(9, 95), job(10, 94)]
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ searchSummary: 'Search completed.', jobs }) }] }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await searchJobs({ profile: null, memories: [], feedback: [], location: 'Singapore', workMode: 'hybrid' })

  assert.equal(requestCount, 2)
  assert.equal(response.jobs.length, 10)
  assert.equal(new Set(response.jobs.map((item) => item.url)).size, 10)
  assert.equal(response.jobs[0].score, 96)
  assert.match(response.searchSummary, /expansion pass supplied enough/i)
})

test('job search excludes employment types that do not match the selected job type', async () => {
  process.env.OPENAI_API_KEY = 'test-key'
  const job = (title, employmentType, id) => ({
    title, company: 'Example', location: 'Singapore', workMode: 'hybrid', employmentType,
    url: `https://example.com/jobs/${id}`, source: 'Example Careers', postedAt: 'Today',
    score: 90, matchLevel: 'excellent', reason: 'Relevant experience.', matchedSkills: ['SQL'],
  })
  globalThis.fetch = async () => new Response(JSON.stringify({ output: [{ content: [{
    type: 'output_text', text: JSON.stringify({ searchSummary: 'Search completed.', jobs: [
      job('Software Engineer', 'Full-time', 'full-time'),
      job('Engineering Intern', 'Internship', 'internship'),
    ] }),
  }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  const response = await searchJobs({ profile: null, memories: [], location: 'Singapore', workMode: 'any', jobType: 'internship' })

  assert.ok(response.jobs.length > 0)
  assert.ok(response.jobs.every((job) => job.employmentType === 'Internship'))
})
