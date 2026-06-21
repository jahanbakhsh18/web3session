/**
 * Indexer entry point. Two phases:
 *
 *   1. BACKFILL — query past events from the last processed block (or INDEXER_START_BLOCK on first run) 
 *      up to the current chain head, in chunks (RPC providers cap how many blocks you can query at once).
 *
 *   2. POLL — every INDEXER_POLL_INTERVAL_MS, re-query from the last processed block to the current head 
 *      and process any new events.
 *
 *      Why polling instead of ethers' built-in event subscriptions (.on)? Subscriptions rely on eth_newFilter, 
 *      which most free-tier RPC providers (Infura, Alchemy free plans) disable. Polling with queryFilter uses 
 *      eth_getLogs, which works everywhere — at the cost of a few seconds of latency instead of instant push from the node.
 *
 * Run standalone: npx tsx src/indexer/run.ts 
 * Or imported and started alongside the API server — see server.ts.
 */

import { sessionRegistry, provider } from './contract.js'
import { getLastProcessedBlock, setLastProcessedBlock } from './state.js'
import {
  handleSessionCreated,
  handleSessionConfirmed,
  handleSessionCompleted,
  handleSessionDisputed,
  handleSessionRefunded,
  handleSessionRated,
} from './handlers.js'
import type { ethers } from 'ethers'

// Some free RPC providers cap eth_getLogs ranges much lower — tune via env if you see range errors
const CHUNK_SIZE = Number(process.env.INDEXER_CHUNK_SIZE ?? 40) // 2000

const EVENT_HANDLERS: Record<string, (event: ethers.EventLog) => Promise<void>> = {
  SessionCreated: handleSessionCreated,
  SessionConfirmed: handleSessionConfirmed,
  SessionCompleted: handleSessionCompleted,
  SessionDisputed: handleSessionDisputed,
  SessionRefunded: handleSessionRefunded,
  SessionRated: handleSessionRated,
}

async function processEvent(event: ethers.EventLog) {
  const handler = EVENT_HANDLERS[event.eventName]
  if (!handler) {
    console.warn(`[indexer] no handler for event: ${event.eventName}`)
    return
  }
  try {
    await handler(event)
  } catch (err) {
    // Log and continue — one malformed event shouldn't kill the whole indexer.
    console.error(`[indexer] error processing ${event.eventName} (tx ${event.transactionHash}):`, err)
  }
}

async function backfill() {
  const startBlockFallback = Number(process.env.INDEXER_START_BLOCK ?? 0)
  const fromBlock = await getLastProcessedBlock(startBlockFallback)
  const toBlock = await provider.getBlockNumber()

  if (fromBlock >= toBlock) {
    console.log(`[indexer] backfill: already caught up (block ${fromBlock})`)
    return
  }

  console.log(`[indexer] backfill: scanning blocks ${fromBlock} → ${toBlock}`)

  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock)

    const events = await sessionRegistry.queryFilter('*', start, end)
    console.log(`[indexer]   blocks ${start}-${end}: ${events.length} event(s)`)

    for (const event of events) {
      // queryFilter('*') can return both EventLog and base Log; narrow here
      if ('args' in event) {
        await processEvent(event as ethers.EventLog)
      }
    }

    await setLastProcessedBlock(end)
  }

  console.log(`[indexer] backfill complete, caught up to block ${toBlock}`)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function pollOnce(): Promise<void> {
  const fromBlock = (await getLastProcessedBlock(0)) + 1
  const toBlock = await provider.getBlockNumber()

  if (fromBlock > toBlock) return // nothing new since last poll

  // Chunked the same way as backfill — some free RPC providers reject or truncate eth_getLogs over wide ranges, 
  // so never query more than CHUNK_SIZE blocks at once even during steady-state polling.
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock)

    const events = await sessionRegistry.queryFilter('*', start, end)
    console.log(`[indexer]   blocks ${start}-${end}: ${events.length} event(s)`)

    for (const event of events) {
      if ('args' in event) {
        await processEvent(event as ethers.EventLog)
      }
    }

    await setLastProcessedBlock(end)
  }
}

/**
 * Runs pollOnce() in a loop, waiting POLL_INTERVAL_MS between each *completed* iteration 
 * (not a fixed-rate timer — setInterval would let iterations overlap if one ever took longer 
 * than the interval, and would fire on schedule even while the previous call is still hung on a slow RPC).
 *
 * On failure: retries with exponential backoff, capped at MAX_BACKOFF_MS, so a temporarily broken RPC provider 
 * doesn't spam errors every 8 seconds forever — it backs off to a slower retry cadence until it recovers.
 */
async function startPollingListener() {
  const POLL_INTERVAL_MS = Number(process.env.INDEXER_POLL_INTERVAL_MS ?? 8000)
  const MAX_BACKOFF_MS = 5 * 60 * 1000 // never wait longer than 5 minutes between retries

  console.log(`[indexer] starting poll loop (every ${POLL_INTERVAL_MS / 1000}s)...`)

  let consecutiveFailures = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce()
      consecutiveFailures = 0
      await sleep(POLL_INTERVAL_MS)
    } catch (err) {
      consecutiveFailures++

      // Exponential backoff: 8s, 16s, 32s, ... capped at MAX_BACKOFF_MS
      const backoff = Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, MAX_BACKOFF_MS)

      console.error(
        `[indexer] poll iteration failed (attempt ${consecutiveFailures}), ` +
        `retrying in ${Math.round(backoff / 1000)}s:`,
        err instanceof Error ? err.message : err
      )

      if (consecutiveFailures >= 5) {
        console.warn(
          `[indexer] ${consecutiveFailures} consecutive failures — ` +
          `check SEPOLIA_RPC_URL in .env. Is the RPC provider correct and reachable?`
        )
      }

      await sleep(backoff)
    }
  }
}

export async function startIndexer() {
  await backfill()
  // Intentionally not awaited — this loop runs forever in the background for the lifetime of the process, 
  // while the rest of server.ts continues handling HTTP requests.
  startPollingListener()
}

// Allow running standalone: npx tsx src/indexer/run.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  startIndexer().catch(err => {
    console.error('[indexer] fatal error:', err)
    process.exit(1)
  })
}