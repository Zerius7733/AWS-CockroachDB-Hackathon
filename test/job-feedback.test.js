import assert from 'node:assert/strict'
import test from 'node:test'
import { JOB_FEEDBACK_TYPES, normalizeJobFeedback, normalizeJobUrl } from '../agent/job-feedback-store.js'

test('job feedback accepts the supported learning actions and normalizes URLs', () => {
  assert.deepEqual(Object.keys(JOB_FEEDBACK_TYPES), [
    'interested', 'not_interested', 'applied', 'hide_company',
    'wrong_seniority', 'wrong_industry', 'poor_location',
  ])
  assert.equal(normalizeJobUrl('https://example.com/jobs/1#details'), 'https://example.com/jobs/1')
  assert.equal(normalizeJobFeedback({
    url: 'https://example.com/jobs/1', title: 'Engineer', company: 'Example', location: 'Singapore', workMode: 'hybrid', employmentType: 'Full-time',
  }, 'interested').feedbackType, 'interested')
})

test('job feedback rejects unsafe URLs, unknown actions, and incomplete jobs', () => {
  assert.throws(() => normalizeJobUrl('javascript:alert(1)'), /valid public job URL/)
  assert.throws(() => normalizeJobFeedback({ url: 'https://example.com/jobs/1', title: 'Engineer', company: 'Example' }, 'maybe'), /valid job feedback action/)
  assert.throws(() => normalizeJobFeedback({ url: 'https://example.com/jobs/1', title: '', company: 'Example' }, 'interested'), /title and company/)
})
