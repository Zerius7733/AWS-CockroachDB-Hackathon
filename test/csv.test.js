import assert from 'node:assert/strict'
import test from 'node:test'
import { applicationFields, parseCsv, toCsv } from '../lib/csv.js'

test('CSV import and export preserve commas, quotes, and newlines', () => {
  const application = Object.fromEntries(applicationFields.map((field) => [field, '']))
  Object.assign(application, {
    id: 'example-id',
    company: 'Example, Inc.',
    role: 'Software "Platform" Engineer',
    notes: 'First line\nSecond line',
  })

  assert.deepEqual(parseCsv(toCsv([application], applicationFields)), [application])
})
