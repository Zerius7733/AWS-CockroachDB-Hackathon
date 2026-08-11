import assert from 'node:assert/strict'
import { extractJobDetails } from './extractor-core.js'

const structured = extractJobDetails({
  title: 'Ignored fallback',
  url: 'https://boards.greenhouse.io/orbit/jobs/123',
  canonicalUrl: 'https://boards.greenhouse.io/orbit/jobs/123',
  meta: {}, headings: [], companies: [], locations: [], salaries: [], employmentTypes: [],
  jsonLd: [JSON.stringify({
    '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Software Engineering Intern',
    hiringOrganization: { '@type': 'Organization', name: 'Orbit Labs' },
    jobLocation: { address: { addressLocality: 'Singapore', addressCountry: 'SG' } },
    employmentType: 'INTERN',
    baseSalary: { currency: 'SGD', value: { minValue: 3500, maxValue: 4500, unitText: 'MONTH' } },
  })],
}, '2026-08-11')

assert.deepEqual(structured.values, {
  company: 'Orbit Labs', role: 'Software Engineering Intern', type: 'Internship', location: 'Singapore, SG',
  salary: 'SGD 3,500–4,500 per month', appliedDate: '2026-08-11', status: 'Applied', source: 'Greenhouse',
  url: 'https://boards.greenhouse.io/orbit/jobs/123', nextStep: '', nextDate: '', notes: '',
})

const fallback = extractJobDetails({
  title: 'Data Analyst - Daylight | LinkedIn', url: 'https://www.linkedin.com/jobs/view/123',
  canonicalUrl: '', meta: { 'og:site_name': 'LinkedIn' }, jsonLd: [], headings: ['Data Analyst'],
  brands: [], companies: ['Daylight'], locations: ['Singapore'], salaries: [], employmentTypes: ['Full-time'], bodyText: '',
}, '2026-08-11')

assert.equal(fallback.values.company, 'Daylight')
assert.equal(fallback.values.role, 'Data Analyst')
assert.equal(fallback.values.source, 'LinkedIn')
assert.equal(fallback.values.salary, '')
assert.equal(fallback.captured.salary, false)

const ubs = extractJobDetails({
  title: '2027 Summer Internship - Group Technology Office - Hong Kong',
  url: 'https://jobs.ubs.com/TGnewUI/Search/home/HomeWithPreLoad?jobDetails=348129_5131',
  canonicalUrl: '', meta: {}, jsonLd: [],
  headings: ['2027 Summer Internship - Group Technology Office - Hong Kong'],
  brands: ['UBS Careers'], companies: [], locations: [], salaries: [], employmentTypes: [],
  bodyText: 'Singapore\nInformation Technology (IT)\nCity\nSingapore\nYour role',
}, '2026-08-11')

assert.equal(ubs.values.company, 'UBS')
assert.equal(ubs.values.location, 'Singapore')
assert.equal(ubs.values.type, 'Internship')

const defaultLocation = extractJobDetails({
  title: 'Analyst', url: 'https://example.com/job', canonicalUrl: '', meta: {}, jsonLd: [],
  headings: ['Analyst'], brands: [], companies: ['Example Co'], locations: [], salaries: [], employmentTypes: [], bodyText: '',
}, '2026-08-11')

assert.equal(defaultLocation.values.location, 'Singapore')
assert.equal(defaultLocation.captured.location, false)

console.log('Extension extraction tests passed')
