import { createEmbedding } from './openai.js'
import { searchMemories } from './memory-store.js'

export const JOB_MEMORY_RETRIEVAL_LIMIT = 12

export const buildJobMemoryQuery = ({ profile, location, workMode, jobType }) => [
  'Retrieve candidate evidence that is most relevant to discovering and ranking suitable job opportunities.',
  `Target roles: ${profile?.targetRoles?.join(', ') || 'Infer cautiously from the candidate profile'}`,
  `Candidate summary: ${profile?.summary || 'Not provided'}`,
  `Preferred location: ${location || 'Any location'}`,
  `Preferred work mode: ${workMode || 'any'}`,
  `Preferred job type: ${jobType || 'any'}`,
].join('\n')

export const retrieveJobSearchMemories = async ({
  userId,
  profile,
  location,
  workMode,
  jobType,
  limit = JOB_MEMORY_RETRIEVAL_LIMIT,
}, dependencies = {}) => {
  const embed = dependencies.createEmbedding || createEmbedding
  const retrieve = dependencies.searchMemories || searchMemories
  const query = buildJobMemoryQuery({ profile, location, workMode, jobType })
  const [queryEmbedding] = await embed(query)
  if (!Array.isArray(queryEmbedding) || !queryEmbedding.length) {
    throw Object.assign(new Error('Could not create a job-memory retrieval embedding'), {
      status: 502,
      code: 'MEMORY_RETRIEVAL_EMBEDDING_MISSING',
    })
  }
  return retrieve(userId, queryEmbedding, limit)
}
