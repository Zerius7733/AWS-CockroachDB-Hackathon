import { extractJobDetails, sampleJobPage } from './extractor-core.js'

const extension = globalThis.chrome
const previewMode = !extension?.tabs || new URLSearchParams(location.search).has('preview')
const form = document.querySelector('#application-form')
const submitButton = document.querySelector('#submit-button')
const openButton = document.querySelector('#open-northstar')
const notice = document.querySelector('#notice')
const trackerInput = document.querySelector('#tracker-url')
const summary = document.querySelector('#capture-summary')
const pageStatus = document.querySelector('#page-status')
const trackedFields = ['company', 'role', 'type', 'location', 'source']
const defaultTrackerUrl = 'https://application-tracker-production-2208.up.railway.app'
const legacyTrackerUrl = 'http://localhost:3001'

let currentTrackerUrl = defaultTrackerUrl

const showNotice = (message, tone = '') => {
  notice.textContent = message
  notice.className = `notice ${tone}`.trim()
}

const setFieldValue = (name, value) => {
  const input = form.elements.namedItem(name)
  if (input) input.value = value || ''
}

const updateFieldState = (name) => {
  const wrapper = form.querySelector(`[data-field="${name}"]`)
  const input = form.elements.namedItem(name)
  if (!wrapper || !input) return
  wrapper.classList.toggle('is-missing', !String(input.value).trim())
}

const refreshSummary = () => {
  const missing = trackedFields.filter((name) => !String(form.elements.namedItem(name)?.value || '').trim())
  summary.textContent = missing.length
    ? `${trackedFields.length - missing.length} details found · ${missing.length} need your input.`
    : 'Everything important was found. Give it a quick check before saving.'
}

const populate = ({ values }) => {
  Object.entries(values).forEach(([name, value]) => setFieldValue(name, value))
  trackedFields.forEach(updateFieldState)
  refreshSummary()
  const missingRequired = ['company', 'role'].find((name) => !form.elements.namedItem(name).value)
  if (missingRequired) form.elements.namedItem(missingRequired).focus()
}

const readCurrentPage = async () => {
  if (previewMode) {
    pageStatus.textContent = 'jobs.example.com'
    populate(extractJobDetails(sampleJobPage))
    return
  }
  const [tab] = await extension.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open a public job posting page, then try again.')
  pageStatus.textContent = new URL(tab.url).hostname.replace(/^www\./, '')
  const results = await extension.scripting.executeScript({ target: { tabId: tab.id }, files: ['collector.js'] })
  const raw = results?.[0]?.result
  if (!raw) throw new Error('This page did not allow Northstar to read its job details.')
  populate(extractJobDetails(raw))
}

const loadSettings = async () => {
  if (previewMode) return
  const saved = await extension.storage.sync.get({ trackerUrl: currentTrackerUrl })
  currentTrackerUrl = saved.trackerUrl === legacyTrackerUrl ? defaultTrackerUrl : saved.trackerUrl
  if (saved.trackerUrl === legacyTrackerUrl) await extension.storage.sync.set({ trackerUrl: currentTrackerUrl })
  trackerInput.value = currentTrackerUrl
}

const normalizeTrackerUrl = (value) => {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Enter a valid http or https Northstar address.')
  url.hash = ''
  return url.href.replace(/\/$/, '')
}

const requestTrackerAccess = async (trackerUrl) => {
  if (previewMode) return true
  const pattern = `${new URL(trackerUrl).origin}/*`
  const allowed = await extension.permissions.contains({ origins: [pattern] })
  return allowed || extension.permissions.request({ origins: [pattern] })
}

trackedFields.forEach((name) => {
  form.elements.namedItem(name)?.addEventListener('input', () => {
    updateFieldState(name)
    refreshSummary()
  })
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!form.reportValidity()) return
  submitButton.disabled = true
  submitButton.querySelector('span').textContent = 'Saving…'
  try {
    currentTrackerUrl = normalizeTrackerUrl(trackerInput.value)
    const allowed = await requestTrackerAccess(currentTrackerUrl)
    if (!allowed) throw new Error('Northstar needs permission to connect to that tracker address.')
    if (!previewMode) await extension.storage.sync.set({ trackerUrl: currentTrackerUrl })
    const application = Object.fromEntries(new FormData(form).entries())
    if (!previewMode) {
      const response = await fetch(`${currentTrackerUrl}/api/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(application),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Northstar could not save this application.')
      }
    }
    showNotice(`${application.role} at ${application.company} was logged.`, 'success')
    submitButton.classList.add('hidden')
    openButton.classList.remove('hidden')
  } catch (error) {
    showNotice(error.message.includes('fetch') ? 'Could not reach Northstar. Check the address and make sure the tracker is running.' : error.message, 'error')
    submitButton.disabled = false
    submitButton.querySelector('span').textContent = 'Log application'
  }
})

openButton.addEventListener('click', () => {
  const url = `${currentTrackerUrl}/#applications`
  if (previewMode) window.open(url, '_blank')
  else extension.tabs.create({ url })
})

Promise.all([loadSettings(), readCurrentPage()]).catch((error) => {
  showNotice(error.message, 'error')
  summary.textContent = 'Fill in the application manually below.'
  setFieldValue('appliedDate', new Date().toISOString().slice(0, 10))
  setFieldValue('status', 'Applied')
  trackedFields.forEach(updateFieldState)
})
