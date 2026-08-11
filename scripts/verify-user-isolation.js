import {
  closeDatabase, createApplication, deleteApplication, ensureUser, getDatabasePool, initializeDatabase,
  getProfile, listApplications, saveProfile, updateApplication,
} from '../lib/database.js'
import { deleteMemory, listMemories } from '../agent/memory-store.js'

const suffix = `${Date.now()}-${crypto.randomUUID()}`
const ownerId = `isolation-owner-${suffix}`
const otherId = `isolation-other-${suffix}`
const pool = getDatabasePool()

try {
  await initializeDatabase()
  await ensureUser({ id: ownerId, username: 'Isolation owner' })
  await ensureUser({ id: otherId, username: 'Isolation other' })
  const item = await createApplication(ownerId, { company: 'Isolation Test', role: 'Private', status: 'Applied' })
  await saveProfile(ownerId, { firstName: 'Alpha', lastName: 'User', email: 'alpha@example.test', role: '', location: '' })
  await listMemories(ownerId)
  const memoryId = crypto.randomUUID()
  await pool.query(
    `INSERT INTO candidate_memories
      (id, user_id, category, title, content, source_name, confidence, verified, embedding)
     VALUES ($1, $2, 'test', 'Private memory', 'Isolation check', 'verification', 1, false, $3::VECTOR)`,
    [memoryId, ownerId, `[${Array(1536).fill(0).join(',')}]`],
  )

  const checks = {
    ownerSeesApplication: (await listApplications(ownerId)).some((entry) => entry.id === item.id),
    otherSeesApplication: (await listApplications(otherId)).some((entry) => entry.id === item.id),
    otherCanUpdate: Boolean(await updateApplication(otherId, item.id, { company: 'Leaked' })),
    otherCanDelete: await deleteApplication(otherId, item.id),
    otherSeesProfile: Boolean(await getProfile(otherId)),
    ownerProfile: (await getProfile(ownerId))?.firstName,
    ownerSeesMemory: (await listMemories(ownerId)).some((entry) => entry.id === memoryId),
    otherSeesMemory: (await listMemories(otherId)).some((entry) => entry.id === memoryId),
    otherCanDeleteMemory: await deleteMemory(otherId, memoryId),
  }
  console.log(JSON.stringify(checks, null, 2))
  if (!checks.ownerSeesApplication || checks.otherSeesApplication || checks.otherCanUpdate || checks.otherCanDelete || checks.otherSeesProfile || checks.ownerProfile !== 'Alpha' || !checks.ownerSeesMemory || checks.otherSeesMemory || checks.otherCanDeleteMemory) {
    throw new Error('Per-user database isolation verification failed')
  }
} finally {
  await pool.query("DELETE FROM applications WHERE user_id LIKE 'isolation-%'")
  await pool.query("DELETE FROM user_profiles WHERE user_id LIKE 'isolation-%'")
  await pool.query("DELETE FROM candidate_memories WHERE user_id LIKE 'isolation-%'")
  await pool.query("DELETE FROM candidate_profiles WHERE user_id LIKE 'isolation-%'")
  await pool.query("DELETE FROM users WHERE id LIKE 'isolation-%'")
  await closeDatabase()
}
