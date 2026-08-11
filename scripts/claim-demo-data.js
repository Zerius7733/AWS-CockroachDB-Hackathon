import { closeDatabase, getDatabasePool, withDatabaseTransaction } from '../lib/database.js'

const email = String(process.argv[2] || '').trim().toLowerCase()
if (!email) {
  console.error('Usage: npm run db:claim-demo -- you@example.com')
  process.exitCode = 1
} else {
  try {
    const userResult = await getDatabasePool().query(
      `SELECT id FROM users WHERE email = $1 AND auth_provider = 'password'`, [email],
    )
    const userId = userResult.rows[0]?.id
    if (!userId) throw new Error('Register that email in Northstar before claiming demo data.')
    const counts = await withDatabaseTransaction(async (client) => {
      const existingMemory = await client.query('SELECT 1 FROM candidate_memories WHERE user_id = $1 LIMIT 1', [userId])
      if (existingMemory.rowCount) throw new Error('This account already has career memories; demo data was not moved.')
      const applications = await client.query("UPDATE applications SET user_id = $1 WHERE user_id = 'demo-user'", [userId])
      const memories = await client.query("UPDATE candidate_memories SET user_id = $1 WHERE user_id = 'demo-user'", [userId])
      const profile = await client.query("UPDATE candidate_profiles SET user_id = $1 WHERE user_id = 'demo-user'", [userId])
      return { applications: applications.rowCount, memories: memories.rowCount, candidateProfiles: profile.rowCount }
    })
    console.log(`Moved demo data to ${email}: ${JSON.stringify(counts)}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally { await closeDatabase() }
}
