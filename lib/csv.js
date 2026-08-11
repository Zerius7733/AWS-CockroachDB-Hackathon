export const applicationFields = ['id', 'company', 'role', 'type', 'location', 'status', 'appliedDate', 'nextStep', 'nextDate', 'source', 'salary', 'url', 'notes']
export const profileFields = ['firstName', 'lastName', 'email', 'role', 'location']

export const parseCsv = (text) => {
  const rows = []
  let row = [], value = '', quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted && char === '"' && text[index + 1] === '"') { value += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(value); value = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(value); value = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else value += char
  }

  if (value || row.length) { row.push(value); rows.push(row) }
  const [headers = [], ...body] = rows
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

const escapeCell = (value = '') => {
  const string = String(value ?? '')
  return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string
}

export const toCsv = (rows, columns) =>
  [columns.join(','), ...rows.map((item) => columns.map((field) => escapeCell(item[field])).join(','))].join('\n') + '\n'
