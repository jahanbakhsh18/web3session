import { Router } from 'express'
import { pool } from '../db/pool.js'

export const reputationRouter = Router()

/**
 * GET /api/reputation/:address
 * Returns the aggregate rating (avg + count) plus the individual ratings received by :address. 
 * This mirrors Reputation.sol's averageScore() but is much cheaper to query than hitting the chain on every page.
 * The frontend can still cross-check against the contract directly if needed.
 */
reputationRouter.get('/reputation/:address', async (req, res) => {
  const address = req.params.address.toLowerCase()

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  try {
    const aggregateResult = await pool.query(
      `SELECT
         COUNT(*)::int AS count,
         COALESCE(SUM(score), 0)::int AS total
       FROM ratings
       WHERE subject_address = $1`,
      [address]
    )

    const { count, total } = aggregateResult.rows[0]
    const average = count > 0 ? Math.round((total / count) * 100) / 100 : null

    const recentResult = await pool.query(
      `SELECT session_id, rater_address, score, tx_hash, created_at
       FROM ratings
       WHERE subject_address = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [address]
    )

    res.json({
      address,count,total,
      average,           // e.g. 4.5 — null if no ratings yet
      recentRatings: recentResult.rows,
    })
  } catch (err) {
    console.error('[api] /reputation/:address failed:', err)
    res.status(500).json({ error: 'Internal error fetching reputation' })
  }
})
