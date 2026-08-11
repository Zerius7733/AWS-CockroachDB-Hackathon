import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, validateRegistration, verifyPassword } from '../lib/auth.js'

test('registration normalizes identity fields and enforces password length', () => {
  assert.deepEqual(validateRegistration({
    firstName: '  Alex ', lastName: '  North  Star ', email: ' ALEX@Example.COM ', password: 'correct horse battery staple',
  }), {
    firstName: 'Alex', lastName: 'North Star', email: 'alex@example.com', password: 'correct horse battery staple',
  })
  assert.throws(
    () => validateRegistration({ firstName: 'Alex', lastName: 'User', email: 'alex@example.com', password: 'short' }),
    /at least 12 characters/,
  )
})

test('passwords are salted, memory-hard hashes and compare safely', async () => {
  const password = 'correct horse battery staple'
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.match(first, /^scrypt\$/)
  assert.notEqual(first, second)
  assert.equal(first.includes(password), false)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword('incorrect password', first), false)
})
