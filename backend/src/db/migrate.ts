/**
 * Applies schema.sql against DATABASE_URL. Safe to run repeatedly.
 * Usage: npm run db:migrate
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL not set — copy backend/.env.example to backend/.env first')
  }

  const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')

  const client = new pg.Client({ connectionString })
  await client.connect()

  console.log('Applying schema.sql...')
  await client.query(sql)
  console.log('✓ Migration complete')

  await client.end()
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exitCode = 1
})
