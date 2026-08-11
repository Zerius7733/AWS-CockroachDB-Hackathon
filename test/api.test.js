import assert from 'node:assert/strict'
import test from 'node:test'
import { request } from '../src/api.js'

const originalFetch = globalThis.fetch
const originalConsoleError = console.error

test.afterEach(() => {
  globalThis.fetch = originalFetch
  console.error = originalConsoleError
})

test('API client reports a gateway timeout without leaking a JSON parse error', async () => {
  const logs = []
  console.error = (...values) => logs.push(values)
  globalThis.fetch = async () => new Response('Internal Server Error', {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'request-123' },
  })

  await assert.rejects(request('/api/agent/jobs'), (error) => {
    assert.match(error.message, /invalid response \(502\).*timed out/i)
    assert.equal(error.requestId, 'request-123')
    assert.doesNotMatch(error.message, /Unexpected token/)
    return true
  })
  assert.equal(logs.length, 1)
  assert.equal(logs[0][1].url, '/api/agent/jobs')
  assert.equal(logs[0][1].status, 502)
})

test('API client preserves JSON error messages and request IDs', async () => {
  console.error = () => {}
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Search failed', requestId: 'request-456' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })

  await assert.rejects(request('/api/agent/jobs'), (error) => {
    assert.equal(error.message, 'Search failed')
    assert.equal(error.requestId, 'request-456')
    return true
  })
})
