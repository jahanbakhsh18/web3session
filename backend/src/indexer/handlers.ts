/**
 * One handler per SessionRegistry event type. Each handler:
 *   1. Upserts the relevant row(s) into Postgres
 *   2. Pushes a real-time notification via Socket.io (see signaling/socket.ts)
 *
 * Handlers are idempotent — re-processing the same event (e.g. after a
 * restart that re-scans a few blocks for safety) should not create duplicates
 * or corrupt state. We rely on PRIMARY KEY / UNIQUE constraints + upserts.
 */

import { ethers } from 'ethers'
import { pool } from '../db/pool.js'
import { notifySessionEvent } from '../signaling/socket.js'
import { provider } from './contract.js'

// Ensures a user row exists for an address before we reference it via FK.
async function ensureUser(address: string) {
  await pool.query(
    `INSERT INTO users (address) VALUES ($1)
     ON CONFLICT (address) DO NOTHING`,
    [address.toLowerCase()]
  )
}

async function blockTimestamp(blockNumber: number): Promise<Date> {
  const block = await provider.getBlock(blockNumber)
  if (!block) throw new Error(`Could not fetch block ${blockNumber}`)
  return new Date(block.timestamp * 1000)
}

// *** SessionCreated ***

export async function handleSessionCreated(event: ethers.EventLog) {
  const [sessionId, caller, callee, deposit, durationSecs, confirmTimeout] = event.args
  const createdAt = await blockTimestamp(event.blockNumber)

  await ensureUser(caller)
  await ensureUser(callee)

  await pool.query(
    `INSERT INTO sessions (
       session_id, caller_address, callee_address, deposit_wei,
       duration_secs, confirm_timeout, status,
       created_at_chain, created_tx_hash, last_event_tx_hash, last_block_number
     ) VALUES ($1,$2,$3,$4,$5,$6,'Escrowed',$7,$8,$8,$9)
     ON CONFLICT (session_id) DO NOTHING`,
    [
      sessionId.toString(),
      caller.toLowerCase(),
      callee.toLowerCase(),
      deposit.toString(),
      Number(durationSecs),
      Number(confirmTimeout),
      createdAt,
      event.transactionHash,
      event.blockNumber,
    ]
  )

  notifySessionEvent({
    sessionId: sessionId.toString(),
    type: 'SessionCreated',
    caller,
    callee,
    txHash: event.transactionHash,
  })

  console.log(`[indexer] SessionCreated #${sessionId} (${caller} → ${callee})`)
}

// *** SessionConfirmed ***

export async function handleSessionConfirmed(event: ethers.EventLog) {
  const [sessionId, callee] = event.args
  const confirmedAt = await blockTimestamp(event.blockNumber)

  const result = await pool.query(
    `UPDATE sessions
       SET status = 'Active', confirmed_at_chain = $1,
           last_event_tx_hash = $2, last_block_number = $3
     WHERE session_id = $4
     RETURNING caller_address, callee_address`,
    [confirmedAt, event.transactionHash, event.blockNumber, sessionId.toString()]
  )

  if (result.rows.length === 0) {
    console.warn(`[indexer] SessionConfirmed for unknown session #${sessionId} — skipping`)
    return
  }

  const { caller_address, callee_address } = result.rows[0]
  notifySessionEvent({
    sessionId: sessionId.toString(),
    type: 'SessionConfirmed',
    caller: caller_address,
    callee: callee_address,
    txHash: event.transactionHash,
  })

  console.log(`[indexer] SessionConfirmed #${sessionId}`)
}

// *** SessionCompleted ***

export async function handleSessionCompleted(event: ethers.EventLog) {
  const [sessionId] = event.args
  const completedAt = await blockTimestamp(event.blockNumber)

  const result = await pool.query(
    `UPDATE sessions
       SET status = 'Completed', completed_at_chain = $1,
           last_event_tx_hash = $2, last_block_number = $3
     WHERE session_id = $4
     RETURNING caller_address, callee_address`,
    [completedAt, event.transactionHash, event.blockNumber, sessionId.toString()]
  )

  if (result.rows.length === 0) {
    console.warn(`[indexer] SessionCompleted for unknown session #${sessionId} — skipping`)
    return
  }

  const { caller_address, callee_address } = result.rows[0]
  notifySessionEvent({
    sessionId: sessionId.toString(),
    type: 'SessionCompleted',
    caller: caller_address,
    callee: callee_address,
    txHash: event.transactionHash,
  })

  console.log(`[indexer] SessionCompleted #${sessionId}`)
}

// *** SessionDisputed ***

export async function handleSessionDisputed(event: ethers.EventLog) {
  const [sessionId] = event.args

  const result = await pool.query(
    `UPDATE sessions
       SET status = 'Disputed', last_event_tx_hash = $1, last_block_number = $2
     WHERE session_id = $3
     RETURNING caller_address, callee_address`,
    [event.transactionHash, event.blockNumber, sessionId.toString()]
  )

  if (result.rows.length === 0) {
    console.warn(`[indexer] SessionDisputed for unknown session #${sessionId} — skipping`)
    return
  }

  const { caller_address, callee_address } = result.rows[0]
  notifySessionEvent({
    sessionId: sessionId.toString(),
    type: 'SessionDisputed',
    caller: caller_address,
    callee: callee_address,
    txHash: event.transactionHash,
  })

  console.log(`[indexer] SessionDisputed #${sessionId}`)
}

// *** SessionRefunded ***

export async function handleSessionRefunded(event: ethers.EventLog) {
  const [sessionId] = event.args

  const result = await pool.query(
    `UPDATE sessions
       SET status = 'Refunded', last_event_tx_hash = $1, last_block_number = $2
     WHERE session_id = $3
     RETURNING caller_address, callee_address`,
    [event.transactionHash, event.blockNumber, sessionId.toString()]
  )

  if (result.rows.length === 0) {
    console.warn(`[indexer] SessionRefunded for unknown session #${sessionId} — skipping`)
    return
  }

  const { caller_address, callee_address } = result.rows[0]
  notifySessionEvent({
    sessionId: sessionId.toString(),
    type: 'SessionRefunded',
    caller: caller_address,
    callee: callee_address,
    txHash: event.transactionHash,
  })

  console.log(`[indexer] SessionRefunded #${sessionId}`)
}

// *** SessionRated ***

export async function handleSessionRated(event: ethers.EventLog) {
  const [sessionId, rater, score] = event.args

  const sessionResult = await pool.query(
    `SELECT caller_address, callee_address FROM sessions WHERE session_id = $1`,
    [sessionId.toString()]
  )

  if (sessionResult.rows.length === 0) {
    console.warn(`[indexer] SessionRated for unknown session #${sessionId} — skipping`)
    return
  }

  const { caller_address, callee_address } = sessionResult.rows[0]
  const raterLower = rater.toLowerCase()
  const subject = raterLower === caller_address ? callee_address : caller_address

  await ensureUser(subject)

  await pool.query(
    `INSERT INTO ratings (session_id, rater_address, subject_address, score, tx_hash, block_number)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (session_id, rater_address) DO NOTHING`,
    [sessionId.toString(), raterLower, subject, Number(score), event.transactionHash, event.blockNumber]
  )

  notifySessionEvent({
    sessionId: sessionId.toString(),
    type: 'SessionRated',
    caller: caller_address,
    callee: callee_address,
    txHash: event.transactionHash,
  })

  console.log(`[indexer] SessionRated #${sessionId} by ${rater} → score ${score}`)
}
