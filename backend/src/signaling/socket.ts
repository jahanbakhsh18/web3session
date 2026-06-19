/**
 * Real-time push layer. Its job is purely to notify connected clients the instant 
 * a relevant on-chain event is indexed, so the frontend doesn't have to poll.
 *
 * Pattern: every connected wallet joins a room named after its lowercase address. 
 * When the indexer processes a SessionCreated event, it emits to the callee's room ("you have a new booking"). 
 * When a session is confirmed, completed, etc., both parties' rooms get notified.
 */

import { Server as SocketIOServer } from 'socket.io'
import type { Server as HTTPServer } from 'node:http'

export type SessionEventPayload = {
  sessionId: string
  type: 'SessionCreated' | 'SessionConfirmed' | 'SessionCompleted'
  | 'SessionDisputed' | 'SessionRefunded' | 'SessionRated'
  caller: string
  callee: string
  txHash: string
}

let io: SocketIOServer | null = null

export function initSignaling(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    },
  })

  io.on('connection', (socket) => {
    console.log(`[socket] client connected: ${socket.id}`)

    // Client announces its wallet address right after connecting.
    // We join it to a room keyed by lowercase address so the indexer can target notifications without broadcasting to everyone.
    socket.on('register', (address: string) => {
      if (!address || typeof address !== 'string') return
      const room = address.toLowerCase()
      socket.join(room)
      console.log(`[socket] ${socket.id} registered as ${room}`)
    })

    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected: ${socket.id}`)
    })
  })

  return io
}

/**
 * Called by the indexer whenever it processes a new on-chain event.
 * Pushes to both parties' rooms — whichever room has no connected socket simply receives nothing (no error, it's a no-op).
 */
export function notifySessionEvent(payload: SessionEventPayload) {
  if (!io) {
    console.warn('[socket] notifySessionEvent called before initSignaling')
    return
  }

  const event = `session:${payload.type}`
  io.to(payload.caller.toLowerCase()).emit(event, payload)
  io.to(payload.callee.toLowerCase()).emit(event, payload)
}
