/**
 * Tracks the indexer's progress in the indexer_state table (single row).
 * On startup, the indexer resumes from the last processed block instead 
 * of re-scanning from genesis or INDEXER_START_BLOCK every restart.
 */

import { pool } from '../db/pool.js'

export async function getLastProcessedBlock(fallback: number): Promise<number> {
  const result = await pool.query<{ last_processed_block: string }>(
    'SELECT last_processed_block FROM indexer_state WHERE id = 1'
  )

  if (result.rows.length === 0) {
    return fallback
  }

  return Number(result.rows[0].last_processed_block)
}

export async function setLastProcessedBlock(blockNumber: number): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_state (id, last_processed_block, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE
       SET last_processed_block = $1, updated_at = now()`,
    [blockNumber]
  )
}
