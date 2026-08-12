import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getCachedJobSearch,
  invalidateJobSearchCache,
  jobSearchCacheKey,
  jobSearchFreshnessMinutes,
  saveJobSearchCache,
} from '../agent/job-search-cache.js'

const originalDatabaseUrl = process.env.DATABASE_URL
const originalFreshness = process.env.JOB_SEARCH_CACHE_MINUTES

test.afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseUrl
  if (originalFreshness === undefined) delete process.env.JOB_SEARCH_CACHE_MINUTES
  else process.env.JOB_SEARCH_CACHE_MINUTES = originalFreshness
})

test('job-search freshness uses a safe configurable threshold', () => {
  process.env.JOB_SEARCH_CACHE_MINUTES = '90'
  assert.equal(jobSearchFreshnessMinutes(), 90)
  process.env.JOB_SEARCH_CACHE_MINUTES = '1'
  assert.equal(jobSearchFreshnessMinutes(), 5)
  process.env.JOB_SEARCH_CACHE_MINUTES = '99999'
  assert.equal(jobSearchFreshnessMinutes(), 1440)
})

test('job-search cache key changes with memory or search preferences', () => {
  const base = { profile: null, memories: [{ id: '1', category: 'skill', title: 'SQL', content: 'Built SQL tools.' }], location: 'Singapore', workMode: 'hybrid', jobType: 'any' }
  assert.equal(jobSearchCacheKey(base), jobSearchCacheKey({ ...base, location: ' singapore ' }))
  assert.notEqual(jobSearchCacheKey(base), jobSearchCacheKey({ ...base, workMode: 'remote' }))
  assert.notEqual(jobSearchCacheKey(base), jobSearchCacheKey({ ...base, jobType: 'internship' }))
  assert.notEqual(jobSearchCacheKey(base), jobSearchCacheKey({ ...base, memories: [{ ...base.memories[0], content: 'Built Python tools.' }] }))
  assert.notEqual(jobSearchCacheKey(base), jobSearchCacheKey({ ...base, feedback: [{ jobUrl: 'https://example.com/job', feedbackType: 'wrong_industry', jobTitle: 'Analyst', company: 'Example' }] }))
})

test('local job-search cache reuses and invalidates results', async () => {
  delete process.env.DATABASE_URL
  process.env.JOB_SEARCH_CACHE_MINUTES = '60'
  const userId = 'cache-test-user'
  const searchKey = 'same-search'
  const payload = { searchSummary: 'Two roles found.', jobs: [{ title: 'Engineer' }] }
  await saveJobSearchCache(userId, searchKey, payload)
  const cached = await getCachedJobSearch(userId, searchKey)
  assert.deepEqual(cached.result, payload)
  assert.ok(new Date(cached.freshUntil) > new Date(cached.createdAt))
  await invalidateJobSearchCache(userId)
  assert.equal(await getCachedJobSearch(userId, searchKey), null)
})
