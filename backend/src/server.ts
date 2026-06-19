/**
 * Entry point. Wires together:
 *   - Express (REST API)
 *   - Socket.io (real-time push, see signaling/socket.ts)
 *   - Postgres pool (see db/pool.ts)
 */

import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import dotenv from 'dotenv'

import { initSignaling } from './signaling/socket.js'
import { healthRouter } from './api/health.js'
import { sessionsRouter } from './api/sessions.js'
import { reputationRouter } from './api/reputation.js'
import { startIndexer } from './indexer/run.js'

dotenv.config()

const PORT = process.env.PORT ?? 4000

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

app.use(healthRouter)
app.use('/api', sessionsRouter)
app.use('/api', reputationRouter)

const httpServer = createServer(app)
initSignaling(httpServer)

httpServer.listen(PORT, () => {
  console.log(`\nweb3session backend listening on http://localhost:${PORT}`)
  console.log(`  REST:      http://localhost:${PORT}/health`)
  console.log(`  Socket.io: ws://localhost:${PORT}\n`)
})

// Indexer runs in-process alongside the API server.
// In production you'd run it as a separate worker process so RPC outage can't take down the REST API.
startIndexer().catch(err => {
  console.error('[indexer] failed to start:', err)
})