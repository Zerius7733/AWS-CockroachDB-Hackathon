const OPENAI_URL = 'https://api.openai.com/v1'

const requestOpenAI = async (path, body) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const response = await fetch(`${OPENAI_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI request failed (${response.status})`)
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
  if (!text) throw new Error('OpenAI returned no structured output')
  return JSON.parse(text)
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

export const searchJobs = async ({ profile, memories, location, workMode }) => {
  const result = await structuredResponse({
    name: 'northstar_job_search',
    schema: jobSearchSchema,
    tools: [{ type: 'web_search' }],
    toolChoice: 'required',
    include: ['web_search_call.action.sources'],
    reasoning: { effort: 'low' },
    input: [
      {
        role: 'developer',
        content: 'You are a careful job-discovery agent. Search the live public web for currently available jobs, then rank them using only the supplied candidate profile and memories. Prefer direct employer career pages, followed by reputable job boards such as LinkedIn. Include only specific job-detail URLs found during this search, never search-result pages or invented URLs. Do not imply that Northstar applied. Keep match reasons grounded in candidate memory and make uncertainty explicit.',
      },
      {
        role: 'user',
        content: `Find up to 8 suitable, currently open jobs.

SEARCH PREFERENCES
Location: ${location || 'Any location'}
Work mode: ${workMode || 'any'}

CANDIDATE PROFILE
Summary: ${profile?.summary || 'Not provided'}
Target roles: ${profile?.targetRoles?.join(', ') || 'Infer cautiously from memory'}
Years of experience: ${profile?.yearsExperience ?? 'Not provided'}

COCKROACHDB CANDIDATE MEMORIES
${memories.map((item) => `- [${item.category}] ${item.title}: ${item.content}`).join('\n')}

Search broadly across employer career sites and public job boards. Prefer recent listings. Return fewer results rather than including a listing without a direct, verifiable URL. Rank the final list from best to weakest fit.`,
      },
    ],
  })

  const seen = new Set()
  return {
    searchSummary: result.searchSummary,
    jobs: result.jobs.filter((job) => {
      if (!isPublicHttpUrl(job.url) || seen.has(job.url)) return false
      seen.add(job.url)
      return true
    }).slice(0, 8),
  }
}
