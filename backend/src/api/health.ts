import { Router } from 'express'
import { pool } from '../db/pool.js'

export const healthRouter = Router()

/**
 * GET /health
 * Confirms the server is up and can reach Postgres.
 * Useful as a deploy test and for the frontend to detect backend availability.
 */
healthRouter.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'connected' })
  } catch (err) {
    console.error('[health] db check failed:', err)
    res.status(503).json({ status: 'degraded', db: 'unreachable' })
  }
})
