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

const matchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: ['strong_match', 'possible_match', 'stretch', 'not_recommended'] },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { requirement: { type: 'string' }, memory: { type: 'string' } },
        required: ['requirement', 'memory'],
      },
    },
    tailoredPitch: { type: 'string' },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'verdict', 'summary', 'strengths', 'gaps', 'evidence', 'tailoredPitch', 'nextSteps'],
}

const structuredResponse = async ({ input, schema, name }) => {
  const response = await requestOpenAI('/responses', {
    model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
    store: false,
    input,
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

export const matchJob = async ({ jobDescription, memories }) => structuredResponse({
  name: 'northstar_job_match',
  schema: matchSchema,
  input: [
    {
      role: 'developer',
      content: 'You are a careful job-application agent. Evaluate fit using only supplied candidate memories. Explain evidence and gaps honestly. Never claim a skill that is not present. The user must approve every external application action.',
    },
    {
      role: 'user',
      content: `JOB DESCRIPTION\n${jobDescription}\n\nRETRIEVED CANDIDATE MEMORY\n${memories.map((item) => `- [${item.category}] ${item.content}`).join('\n')}`,
    },
  ],
})

