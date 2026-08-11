import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

const requestContext = new AsyncLocalStorage()

const errorDetails = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error),
  code: error?.code,
  status: error?.status,
  stack: error?.stack,
})

const writeLog = (level, event, details = {}) => {
  const context = requestContext.getStore() || {}
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
    ...details,
  }
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  writer(JSON.stringify(payload))
}

export const logInfo = (event, details) => writeLog('info', event, details)
export const logWarn = (event, details) => writeLog('warn', event, details)
export const logError = (event, error, details = {}) => writeLog('error', event, { ...details, error: errorDetails(error) })

export const requestLogger = (req, res, next) => {
  const requestId = req.get('x-request-id') || randomUUID()
  const context = { requestId, method: req.method, path: req.path }
  const startedAt = Date.now()
  let completed = false

  req.requestId = requestId
  res.set('X-Request-Id', requestId)

  requestContext.run(context, () => {
    if (req.path.startsWith('/api/')) logInfo('request_started')
    res.on('finish', () => {
      completed = true
      if (!req.path.startsWith('/api/')) return
      const details = { status: res.statusCode, durationMs: Date.now() - startedAt }
      if (res.statusCode >= 500) logWarn('request_completed_with_server_error', details)
      else logInfo('request_completed', details)
    })
    res.on('close', () => {
      if (!completed && req.path.startsWith('/api/')) logWarn('request_connection_closed', { durationMs: Date.now() - startedAt })
    })
    next()
  })
}

export const sendError = (req, res, error, fallbackStatus = 500, details = {}) => {
  const status = Number(error?.status) || fallbackStatus
  logError('request_failed', error, { status, ...details })
  if (res.headersSent) return res.end()
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'The server could not complete this request'
    : error?.message || 'The server could not complete this request'
  return res.status(status).json({ error: message, requestId: req.requestId })
}

export const installProcessErrorLogging = () => {
  process.on('unhandledRejection', (error) => logError('unhandled_rejection', error))
  process.on('uncaughtExceptionMonitor', (error) => logError('uncaught_exception', error))
}
