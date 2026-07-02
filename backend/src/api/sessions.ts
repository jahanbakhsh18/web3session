import { Router } from 'express'
import { pool } from '../db/pool.js'

export const sessionsRouter = Router()

/**
 * GET /api/sessions/:address
 * Returns all sessions where :address was caller or callee, newest first. This is a READ MIRROR of on-chain state.
 * The frontend should treat the tx hashes in the response as the source of truth and link to Etherscan.
 */
sessionsRouter.get('/sessions/:address', async (req, res) => {
  const address = req.params.address.toLowerCase()

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  try {
    const result = await pool.query(
      `SELECT
         session_id, caller_address, callee_address, deposit_wei,
         duration_secs, confirm_timeout, scheduled_start_at, status,
         created_at_chain, confirmed_at_chain, completed_at_chain,
         created_tx_hash, last_event_tx_hash
       FROM sessions
       WHERE caller_address = $1 OR callee_address = $1
       ORDER BY created_at_chain DESC`,
      [address]
    )

    res.json({ address, sessions: result.rows })
  } catch (err) {
    console.error('[api] /sessions/:address failed:', err)
    res.status(500).json({ error: 'Internal error fetching sessions' })
  }
})

/**
 * GET /api/sessions/:address/pending
 * Convenience endpoint: sessions where :address is the callee and the session is still 'Escrowed' 
 * (i.e. awaiting their confirmation). This is what would back a "you have N pending bookings" notification badge.
 */
sessionsRouter.get('/sessions/:address/pending', async (req, res) => {
  const address = req.params.address.toLowerCase()

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  try {
    const result = await pool.query(
      `SELECT session_id, caller_address, deposit_wei, duration_secs,
              confirm_timeout, created_at_chain, created_tx_hash
       FROM sessions
       WHERE callee_address = $1 AND status = 'Escrowed'
       ORDER BY created_at_chain DESC`,
      [address]
    )

    res.json({ address, pending: result.rows })
  } catch (err) {
    console.error('[api] /sessions/:address/pending failed:', err)
    res.status(500).json({ error: 'Internal error fetching pending sessions' })
  }
})

/**
 * GET /api/sessions/by-id/:sessionId
 * Returns a single session by its on-chain ID, including its ratings.
 */
sessionsRouter.get('/sessions/by-id/:sessionId', async (req, res) => {
  const { sessionId } = req.params

  try {
    const sessionResult = await pool.query(
      `SELECT * FROM sessions WHERE session_id = $1`,
      [sessionId]
    )

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const ratingsResult = await pool.query(
      `SELECT rater_address, subject_address, score, tx_hash
       FROM ratings WHERE session_id = $1`,
      [sessionId]
    )

    res.json({
      session: sessionResult.rows[0],
      ratings: ratingsResult.rows,
    })
  } catch (err) {
    console.error('[api] /sessions/by-id/:sessionId failed:', err)
    res.status(500).json({ error: 'Internal error fetching session' })
  }
})
