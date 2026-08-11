(() => {
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const unique = (values) => [...new Set(values.map(clean).filter(Boolean))]
  const collect = (selectors, limit = 8) => unique(
    selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((element) => element.getAttribute('alt') || element.innerText || element.textContent)),
  ).slice(0, limit)

  const meta = Object.fromEntries(
    [...document.querySelectorAll('meta[name], meta[property]')]
      .map((element) => [element.getAttribute('name') || element.getAttribute('property'), element.content])
      .filter(([name, content]) => name && content),
  )

  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href || location.href
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => script.textContent)
    .filter(Boolean)

  return {
    title: document.title,
    url: location.href,
    canonicalUrl,
    jsonLd,
    meta,
    headings: collect(['h1', '[data-testid*="job-title"]', '[class*="job-title"]']),
    brands: collect([
      'header img[alt]',
      '[class*="logo"] img[alt]',
      '[class*="brand"] img[alt]',
      '[class*="logo"]',
      '[class*="brand-name"]',
    ]),
    companies: collect([
      '[data-company-name]',
      '[data-testid*="company"]',
      '.topcard__org-name-link',
      '.topcard__flavor',
      '.jobsearch-InlineCompanyRating-companyHeader',
      '[class*="company-name"]',
      '[class*="companyName"]',
    ]),
    locations: collect([
      '[data-testid*="location"]',
      '.topcard__flavor--bullet',
      '.jobsearch-JobInfoHeader-subtitle [data-testid="inlineHeader-companyLocation"]',
      '[class*="job-location"]',
      '[class*="location"]',
      '[class*="city"]',
    ]),
    salaries: collect([
      '[data-testid*="salary"]',
      '[class*="salary"]',
      '[class*="compensation"]',
    ]),
    employmentTypes: collect([
      '[data-testid*="employment-type"]',
      '[class*="employment-type"]',
      '[class*="job-type"]',
    ]),
    bodyText: String(document.body?.innerText || '').slice(0, 80000),
  }
})()
