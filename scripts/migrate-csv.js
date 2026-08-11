import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDatabase, initializeDatabase, replaceApplications, saveProfile } from '../lib/database.js'
import { parseCsv } from '../lib/csv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const migrationUserId = 'demo-user'

const readCsvIfPresent = async (filename) => {
  try { return parseCsv(await fs.readFile(path.join(dataDir, filename), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
}

try {
  await initializeDatabase()
  const applications = await readCsvIfPresent('applications.csv')
  const profiles = await readCsvIfPresent('profile.csv')

  if (applications.length) {
    await replaceApplications(migrationUserId, applications)
    console.log(`Migrated ${applications.length} applications to CockroachDB.`)
  } else console.log('No data/applications.csv file found; applications were not changed.')

  if (profiles[0]) {
    const legacy = profiles[0]
    if (legacy.name && !legacy.firstName) {
      const [firstName, ...lastName] = legacy.name.trim().split(/\s+/)
      legacy.firstName = firstName
      legacy.lastName = lastName.join(' ')
    }
    await saveProfile(migrationUserId, {
      firstName: legacy.firstName || '',
      lastName: legacy.lastName || '',
      email: legacy.email || '',
      role: legacy.role || '',
      location: legacy.location || '',
    })
    console.log('Migrated the workspace profile to CockroachDB.')
  } else console.log('No data/profile.csv file found; the profile was not changed.')
} finally {
  await closeDatabase()
}
