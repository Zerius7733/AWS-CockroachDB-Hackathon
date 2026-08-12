import { logError, logInfo } from '../lib/logger.js'

const OPENAI_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_TIMEOUT_MS = 90_000

const openaiTimeoutMs = () => {
  const configured = Number(process.env.OPENAI_TIMEOUT_MS || DEFAULT_OPENAI_TIMEOUT_MS)
  return Number.isFinite(configured) ? Math.min(240_000, Math.max(5_000, configured)) : DEFAULT_OPENAI_TIMEOUT_MS
}

const requestOpenAI = async (path, body) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const startedAt = Date.now()
  const timeoutMs = openaiTimeoutMs()
  logInfo('openai_request_started', { path, model: body.model, timeoutMs, webSearch: Boolean(body.tools?.some((tool) => tool.type === 'web_search')) })

  let response
  try {
    response = await fetch(`${OPENAI_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = ['AbortError', 'TimeoutError'].includes(error.name)
    const requestError = Object.assign(
      new Error(timedOut ? `OpenAI request timed out after ${timeoutMs} ms` : `OpenAI request failed: ${error.message}`),
      { status: timedOut ? 504 : 502, code: timedOut ? 'OPENAI_TIMEOUT' : 'OPENAI_NETWORK_ERROR', cause: error },
    )
    logError('openai_request_failed', requestError, { path, model: body.model, durationMs: Date.now() - startedAt })
    throw requestError
  }

  const openaiRequestId = response.headers.get('x-request-id') || undefined
  const rawPayload = await response.text()
  let payload
  try { payload = rawPayload ? JSON.parse(rawPayload) : {} }
  catch (error) {
    const responseError = Object.assign(new Error('OpenAI returned an invalid JSON response'), { status: 502, code: 'OPENAI_INVALID_RESPONSE', cause: error })
    logError('openai_response_invalid', responseError, { path, model: body.model, upstreamStatus: response.status, openaiRequestId, durationMs: Date.now() - startedAt })
    throw responseError
  }
  if (!response.ok) {
    const responseError = Object.assign(
      new Error(payload.error?.message || `OpenAI request failed (${response.status})`),
      { status: response.status === 429 ? 503 : 502, code: payload.error?.code || 'OPENAI_API_ERROR', upstreamStatus: response.status },
    )
    logError('openai_api_error', responseError, { path, model: body.model, upstreamStatus: response.status, openaiRequestId, durationMs: Date.now() - startedAt })
    throw responseError
  }
  logInfo('openai_request_completed', { path, model: body.model, upstreamStatus: response.status, openaiRequestId, durationMs: Date.now() - startedAt })
  return payload
}

const outputText = (response) => {
  if (response.output_text) return response.output_text
  return response.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text || ''
}

const memoryItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: ['skill', 'experience', 'achievement', 'education', 'certification', 'preference', 'identity'] },
    title: { type: 'string' },
    content: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['category', 'title', 'content', 'confidence'],
}

const resumeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    targetRoles: { type: 'array', items: { type: 'string' } },
    yearsExperience: { type: 'number' },
    memories: { type: 'array', items: memoryItemSchema },
  },
  required: ['summary', 'targetRoles', 'yearsExperience', 'memories'],
}

const jobSearchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    searchSummary: { type: 'string' },
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          location: { type: 'string' },
          workMode: { type: 'string', enum: ['remote', 'hybrid', 'on-site', 'unspecified'] },
          employmentType: { type: 'string' },
          url: { type: 'string' },
          source: { type: 'string' },
          postedAt: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          matchLevel: { type: 'string', enum: ['excellent', 'strong', 'possible', 'stretch'] },
          reason: { type: 'string' },
          matchedSkills: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'company', 'location', 'workMode', 'employmentType', 'url', 'source', 'postedAt', 'score', 'matchLevel', 'reason', 'matchedSkills'],
      },
    },
  },
  required: ['searchSummary', 'jobs'],
}

const structuredResponse = async ({ input, schema, name, tools, toolChoice, include, reasoning }) => {
  const response = await requestOpenAI('/responses', {
    model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
    store: false,
    input,
    ...(tools ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(include ? { include } : {}),
    ...(reasoning ? { reasoning } : {}),
    text: { format: { type: 'json_schema', name, strict: true, schema } },
  })
  const text = outputText(response)
  if (!text) throw Object.assign(new Error('OpenAI returned no structured output'), { status: 502, code: 'OPENAI_EMPTY_OUTPUT' })
  try { return JSON.parse(text) }
  catch (error) {
    const parseError = Object.assign(new Error('OpenAI returned invalid structured output'), { status: 502, code: 'OPENAI_INVALID_STRUCTURED_OUTPUT', cause: error })
    logError('openai_structured_output_invalid', parseError, { name })
    throw parseError
  }
}

export const extractResume = async ({ filename, mimeType, base64 }) => structuredResponse({
  name: 'northstar_resume_memory',
  schema: resumeSchema,
  input: [{
    role: 'user',
    content: [
      { type: 'input_file', filename, file_data: `data:${mimeType};base64,${base64}` },
      {
        type: 'input_text',
        text: 'Extract durable career memories from this resume. Keep every claim grounded in the document. Write concise, standalone facts. Do not infer protected traits or fabricate missing information.',
      },
    ],
  }],
})
export const createEmbedding = async (input) => {
  const values = Array.isArray(input) ? input : [input]
  const response = await requestOpenAI('/embeddings', {
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    input: values,
  })
  return response.data.map((item) => item.embedding)
}

const isPublicHttpUrl = (value) => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) }
  catch { return false }
}

const TARGET_JOB_COUNT = 10
const INITIAL_CANDIDATE_COUNT = 14

const candidateContext = ({ profile, memories, feedback, location, workMode, jobType }) => `SEARCH PREFERENCES
Location: ${location || 'Any location'}
Work mode: ${workMode || 'any'}
Job type: ${jobType || 'any'}

CANDIDATE PROFILE
Summary: ${profile?.summary || 'Not provided'}
Target roles: ${profile?.targetRoles?.join(', ') || 'Infer cautiously from memory'}
Years of experience: ${profile?.yearsExperience ?? 'Not provided'}

COCKROACHDB CANDIDATE MEMORIES
${memories.map((item) => `- [${item.category}] ${item.title}: ${item.content}`).join('\n')}

COCKROACHDB JOB FEEDBACK MEMORY
${feedback.length
    ? feedback.map((item) => `- [${item.feedbackType}] ${item.jobTitle} at ${item.company} — ${item.location || 'location unspecified'} (${item.workMode || 'work mode unspecified'})`).join('\n')
    : '- No job feedback recorded yet.'}`

const discoverJobs = async ({ profile, memories, feedback, location, workMode, jobType, instruction }) => structuredResponse({
  name: 'northstar_job_search',
  schema: jobSearchSchema,
  tools: [{ type: 'web_search' }],
  toolChoice: 'required',
  include: ['web_search_call.action.sources'],
  reasoning: { effort: 'low' },
  input: [
    {
      role: 'developer',
      content: 'You are a careful job-discovery agent. Search the live public web for currently available jobs, then rank them using only the supplied candidate profile, memories, and explicit feedback. Prefer direct employer career pages, followed by reputable job boards such as LinkedIn. Include only specific job-detail URLs found during this search, never search-result pages or invented URLs. Do not imply that Northstar applied. Keep match reasons grounded in candidate memory and make uncertainty explicit. Treat applied and interested feedback as positive signals; exclude hidden companies; use negative feedback cautiously without overgeneralizing from one decision. Briefly mention material feedback adaptations in the search summary.',
    },
    {
      role: 'user',
      content: `${instruction}

${candidateContext({ profile, memories, feedback, location, workMode, jobType })}

Search broadly across employer career sites and public job boards. Prefer recent listings. Never return a job marked not interested or applied, and never return jobs from a hidden company. Return fewer results rather than including a listing without a direct, verifiable URL. Rank the final list from best to weakest fit.`,
    },
  ],
})

const matchesJobType = (employmentType, jobType) => {
  if (!jobType || jobType === 'any') return true
  const normalized = String(employmentType || '').trim().toLowerCase()
  if (jobType === 'internship') return normalized.includes('intern')
  return normalized.includes('full-time') || normalized.includes('full time') || normalized.includes('permanent')
}

const appendUniquePublicJobs = (target, candidates, seen, jobType) => {
  for (const job of candidates) {
    if (!isPublicHttpUrl(job.url) || seen.has(job.url) || !matchesJobType(job.employmentType, jobType)) continue
    seen.add(job.url)
    target.push(job)
  }
}

export const searchJobs = async ({ profile, memories, feedback = [], location, workMode, jobType = 'any' }) => {
  const first = await discoverJobs({
    profile, memories, feedback, location, workMode, jobType,
    instruction: `Find ${INITIAL_CANDIDATE_COUNT} suitable, currently open ${jobType === 'any' ? '' : `${jobType} `}job candidates so that at least ${TARGET_JOB_COUNT} remain after URL and job-type validation. Return distinct direct job-detail URLs.`,
  })
  const seen = new Set()
  const jobs = []
  appendUniquePublicJobs(jobs, first.jobs, seen, jobType)

  let expansion
  if (jobs.length < TARGET_JOB_COUNT) {
    const missing = TARGET_JOB_COUNT - jobs.length
    expansion = await discoverJobs({
      profile, memories, feedback, location, workMode, jobType,
      instruction: `The first pass produced only ${jobs.length} verified distinct jobs. Find at least ${missing + 3} additional suitable jobs to reach a minimum of ${TARGET_JOB_COUNT}. Keep the stated location, work-mode, and job-type preferences, broaden relevant role titles and public sources, and exclude these already-found URLs:\n${[...seen].map((url) => `- ${url}`).join('\n') || '- None'}`,
    })
    appendUniquePublicJobs(jobs, expansion.jobs, seen, jobType)
  }

  const rankedJobs = jobs.sort((left, right) => right.score - left.score).slice(0, TARGET_JOB_COUNT)
  const expansionNote = expansion
    ? rankedJobs.length >= TARGET_JOB_COUNT
      ? ` An expansion pass supplied enough additional verified listings to reach ${TARGET_JOB_COUNT}.`
      : ` An expansion pass was attempted, but only ${rankedJobs.length} distinct jobs with valid direct URLs could be verified; no listings were fabricated to fill the remainder.`
    : ''
  return {
    searchSummary: `${first.searchSummary}${expansionNote}`,
    jobs: rankedJobs,
  }
}
