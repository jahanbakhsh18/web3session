/**
 * Shared Postgres connection pool, used by both the indexer and the API routes.
 * Import { pool } from this module rather than creating new clients per request.
 */

import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL not set — copy backend/.env.example to backend/.env first')
}

export const pool = new pg.Pool({ connectionString })

pool.on('error', (err) => {
  // Catches idle-client errors so a dropped connection doesn't crash the process
  console.error('Unexpected Postgres pool error:', err)
})
