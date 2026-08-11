import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { getDatabasePool, withDatabaseTransaction } from './database.js'

const scrypt = promisify(scryptCallback)
const sessionCookie = 'northstar_session'
const scryptParameters = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const passwordKeyLength = 64
const loginWindowMinutes = 15
const maximumLoginAttempts = 5
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isProduction = () => process.env.NODE_ENV === 'production'
const sessionDays = () => Math.min(30, Math.max(1, Number(process.env.AUTH_SESSION_DAYS || 7)))
const tokenHash = (token) => createHash('sha256').update(token).digest('hex')
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ')
const authError = (status, message) => Object.assign(new Error(message), { status })

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => {
  const index = part.indexOf('=')
  if (index < 0) return ['', '']
  return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]
}).filter(([key]) => key))

const sessionCookieValue = (value, maxAge) => {
  const parts = [`${sessionCookie}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (isProduction()) parts.push('Secure')
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
  return parts.join('; ')
}

export const validateRegistration = ({ firstName, lastName, email, password } = {}) => {
  const normalized = {
    firstName: cleanName(firstName), lastName: cleanName(lastName),
    email: normalizeEmail(email), password: String(password || ''),
  }
  if (!normalized.firstName || !normalized.lastName) throw authError(400, 'First name and last name are required')
  if (normalized.firstName.length > 80 || normalized.lastName.length > 80) throw authError(400, 'Names must be 80 characters or fewer')
  if (!emailPattern.test(normalized.email) || normalized.email.length > 254) throw authError(400, 'Enter a valid email address')
  if (normalized.password.length < 12) throw authError(400, 'Password must be at least 12 characters')
  if (normalized.password.length > 128 || Buffer.byteLength(normalized.password) > 256) throw authError(400, 'Password is too long')
  return normalized
}

export const hashPassword = async (password) => {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, passwordKeyLength, scryptParameters)
  return `scrypt$${scryptParameters.N}$${scryptParameters.r}$${scryptParameters.p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

export const verifyPassword = async (password, storedHash) => {
  try {
    const [algorithm, n, r, p, saltValue, hashValue] = String(storedHash || '').split('$')
    if (algorithm !== 'scrypt') return false
    const expected = Buffer.from(hashValue, 'base64url')
    const derived = Buffer.from(await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    }))
    return expected.length === derived.length && timingSafeEqual(expected, derived)
  } catch { return false }
}

const publicUser = (row) => ({
  id: row.id, username: row.username, email: row.email, authProvider: 'password', mode: 'password',
})

const createSession = async (req, userId, database = getDatabasePool()) => {
  const token = randomBytes(32).toString('base64url')
  const maxAge = sessionDays() * 24 * 60 * 60
  await database.query('DELETE FROM auth_sessions WHERE expires_at <= now()')
  await database.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent, ip_address)
     VALUES ($1, $2, now() + ($3::INT8 * interval '1 second'), $4, $5)`,
    [tokenHash(token), userId, maxAge, String(req.get('user-agent') || '').slice(0, 500), String(req.ip || '').slice(0, 100)],
  )
  return { token, maxAge }
}

const attachSession = (res, session) => res.append('Set-Cookie', sessionCookieValue(session.token, session.maxAge))

const attemptKey = (req, email) => tokenHash(`${email}|${req.ip || ''}`)

const assertNotLocked = async (key) => {
  const result = await getDatabasePool().query(
    'SELECT locked_until > now() AS locked FROM auth_login_attempts WHERE key_hash = $1', [key],
  )
  if (result.rows[0]?.locked) throw authError(429, 'Too many sign-in attempts. Try again in 15 minutes.')
}

const recordFailedLogin = async (key) => withDatabaseTransaction(async (client) => {
  const current = await client.query(
    `SELECT attempts, window_started_at < now() - interval '15 minutes' AS expired
     FROM auth_login_attempts WHERE key_hash = $1 FOR UPDATE`, [key],
  )
  const attempts = current.rows[0] && !current.rows[0].expired ? Number(current.rows[0].attempts) + 1 : 1
  const locked = attempts >= maximumLoginAttempts
  await client.query(
    `UPSERT INTO auth_login_attempts (key_hash, attempts, window_started_at, locked_until, updated_at)
     VALUES ($1, $2,
       CASE WHEN $3 THEN (SELECT window_started_at FROM auth_login_attempts WHERE key_hash = $1) ELSE now() END,
       CASE WHEN $4 THEN now() + interval '15 minutes' ELSE NULL END, now())`,
    [key, attempts, Boolean(current.rows[0] && !current.rows[0].expired), locked],
  )
  return locked
})

export const register = async (req, res) => {
  const input = validateRegistration(req.body)
  const passwordHash = await hashPassword(input.password)
  const userId = crypto.randomUUID()
  let account
  try {
    account = await withDatabaseTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO users (id, username, email, password_hash, auth_provider)
         VALUES ($1, $2, $3, $4, 'password') RETURNING id, username, email`,
        [userId, `${input.firstName} ${input.lastName}`, input.email, passwordHash],
      )
      await client.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, email, role, location)
         VALUES ($1, $2, $3, $4, '', '')`,
        [userId, input.firstName, input.lastName, input.email],
      )
      const user = publicUser(created.rows[0])
      const session = await createSession(req, user.id, client)
      return { user, session }
    })
  } catch (error) {
    if (error.code === '23505') throw authError(409, 'An account with this email already exists')
    throw error
  }
  attachSession(res, account.session)
  res.status(201).json(account.user)
}

export const login = async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')
  if (!email || !password) throw authError(400, 'Email and password are required')
  if (email.length > 254 || password.length > 128 || Buffer.byteLength(password) > 256) throw authError(400, 'Email or password is invalid')
  const key = attemptKey(req, email)
  await assertNotLocked(key)
  const result = await getDatabasePool().query(
    `SELECT id, username, email, password_hash FROM users
     WHERE email = $1 AND auth_provider = 'password'`, [email],
  )
  const row = result.rows[0]
  const placeholder = `scrypt$${scryptParameters.N}$${scryptParameters.r}$${scryptParameters.p}$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(passwordKeyLength).toString('base64url')}`
  const valid = await verifyPassword(password, row?.password_hash || placeholder)
  if (!row || !valid) {
    const locked = await recordFailedLogin(key)
    throw authError(locked ? 429 : 401, locked ? 'Too many sign-in attempts. Try again in 15 minutes.' : 'Invalid email or password')
  }
  await getDatabasePool().query('DELETE FROM auth_login_attempts WHERE key_hash = $1', [key])
  attachSession(res, await createSession(req, row.id))
  res.json(publicUser(row))
}

export const authenticationMode = () => 'password'

export const authenticateRequest = async (req) => {
  const token = parseCookies(req.get('cookie'))[sessionCookie]
  if (!token) return null
  const result = await getDatabasePool().query(
    `SELECT users.id, users.username, users.email
     FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = $1 AND auth_sessions.expires_at > now()`,
    [tokenHash(token)],
  )
  return result.rows[0] ? publicUser(result.rows[0]) : null
}

export const requireAuth = async (req, res, next) => {
  try {
    const user = await authenticateRequest(req)
    if (!user) return res.status(401).json({ error: 'Authentication required' })
    req.user = user
    next()
  } catch (error) { res.status(error.status || 500).json({ error: error.message }) }
}

export const logout = async (req, res) => {
  const token = parseCookies(req.get('cookie'))[sessionCookie]
  if (token) await getDatabasePool().query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash(token)])
  res.append('Set-Cookie', sessionCookieValue('', 0))
  res.status(204).end()
}
