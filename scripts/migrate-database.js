import { initializeMemoryStore } from '../agent/memory-store.js'
import { closeDatabase, initializeDatabase } from '../lib/database.js'

try {
  await initializeDatabase()
  await initializeMemoryStore()
  console.log('CockroachDB schemas are ready.')
} finally { await closeDatabase() }
