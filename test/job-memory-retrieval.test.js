import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildJobMemoryQuery,
  JOB_MEMORY_RETRIEVAL_LIMIT,
  retrieveJobSearchMemories,
} from '../agent/job-memory-retrieval.js'

test('job-memory retrieval embeds search intent and queries CockroachDB vector memory', async () => {
  const profile = { summary: 'Platform engineer', targetRoles: ['Platform Engineer', 'SRE'] }
  const calls = []
  const memories = [{ id: 'memory-1', title: 'Distributed systems' }]

  const result = await retrieveJobSearchMemories({
    userId: 'user-1', profile, location: 'Singapore', workMode: 'hybrid', jobType: 'internship',
  }, {
    createEmbedding: async (query) => {
      calls.push({ type: 'embed', query })
      return [[0.1, 0.2, 0.3]]
    },
    searchMemories: async (userId, embedding, limit) => {
      calls.push({ type: 'search', userId, embedding, limit })
      return memories
    },
  })

  assert.deepEqual(result, memories)
  assert.match(calls[0].query, /Platform Engineer, SRE/)
  assert.match(calls[0].query, /Singapore/)
  assert.match(calls[0].query, /hybrid/)
  assert.match(calls[0].query, /internship/)
  assert.deepEqual(calls[1], {
    type: 'search', userId: 'user-1', embedding: [0.1, 0.2, 0.3], limit: JOB_MEMORY_RETRIEVAL_LIMIT,
  })
})

test('job-memory retrieval rejects an empty embedding response', async () => {
  await assert.rejects(
    retrieveJobSearchMemories({ userId: 'user-1', profile: null, location: '', workMode: 'any' }, {
      createEmbedding: async () => [],
      searchMemories: async () => { throw new Error('search should not run') },
    }),
    (error) => error.code === 'MEMORY_RETRIEVAL_EMBEDDING_MISSING',
  )
})

test('job-memory query has safe fallbacks for missing preferences', () => {
  const query = buildJobMemoryQuery({ profile: null, location: '', workMode: '' })
  assert.match(query, /Infer cautiously/)
  assert.match(query, /Any location/)
  assert.match(query, /any/)
})
