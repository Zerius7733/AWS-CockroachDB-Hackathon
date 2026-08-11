const apiError = (message, response, requestId) => {
  const error = new Error(message)
  error.status = response?.status
  error.requestId = requestId
  return error
}

const logRequestError = ({ error, method, url, response, requestId, contentType }) => {
  console.error('[Northstar API request failed]', {
    method,
    url,
    status: response?.status,
    statusText: response?.statusText,
    requestId,
    contentType,
    error: error.message,
  })
}

export const request = async (url, options = {}) => {
  const { expectedStatuses = [], ...fetchOptions } = options
  const method = fetchOptions.method || 'GET'
  let response
  try {
    response = await fetch(url, fetchOptions)
  } catch (error) {
    logRequestError({ error, method, url })
    throw error
  }

  const requestId = response.headers.get('x-request-id') || response.headers.get('x-amzn-requestid') || undefined
  const contentType = response.headers.get('content-type') || ''
  if (response.status === 204) return null

  const text = await response.text()
  let payload = null
  if (contentType.includes('application/json') && text) {
    try {
      payload = JSON.parse(text)
    } catch (parseError) {
      const message = response.ok
        ? 'The server returned invalid JSON'
        : `The server returned an invalid response (${response.status}). It may have timed out.`
      const error = apiError(message, response, requestId)
      error.cause = parseError
      logRequestError({ error, method, url, response, requestId, contentType })
      throw error
    }
  }

  if (!response.ok) {
    const fallback = response.status === 502 || response.status === 504
      ? `The server could not complete the request (${response.status}). It may have timed out.`
      : `Request failed (${response.status})`
    const error = apiError(payload?.error || fallback, response, payload?.requestId || requestId)
    if (!expectedStatuses.includes(response.status)) logRequestError({ error, method, url, response, requestId: error.requestId, contentType })
    throw error
  }

  if (!contentType.includes('application/json')) {
    const error = apiError('The server returned an unsupported response format', response, requestId)
    logRequestError({ error, method, url, response, requestId, contentType })
    throw error
  }
  return payload
}
