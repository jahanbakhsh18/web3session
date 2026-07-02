/**
 * Registers the connected wallet's address so the backend can push session-event 
 * notifications targeted at this specific user, the moment the indexer processes them.
 *
 * This hook only exposes the raw event stream via a callback; it doesn't own any session data itself. 
 * useDashboard.ts subscribes and refetches when a relevant event arrives — see the 'sessionEvent' wiring there.
 */

import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL } from '../config/contracts'

export type SessionEventPayload = {
  sessionId: string
  type: 'SessionCreated' | 'SessionConfirmed' | 'SessionCompleted'
    | 'SessionDisputed' | 'SessionRefunded' | 'SessionRated'
  caller: string
  callee: string
  txHash: string
}

const EVENT_TYPES: SessionEventPayload['type'][] = [
  'SessionCreated', 'SessionConfirmed', 'SessionCompleted',
  'SessionDisputed', 'SessionRefunded', 'SessionRated',
]

export function useSocket(address: string | null, onSessionEvent: (payload: SessionEventPayload) => void) {
  const socketRef = useRef<Socket | null>(null)
  // Keep the latest callback in a ref so the socket connection doesn't need
  // to be torn down and rebuilt every time the caller's callback identity changes.
  const callbackRef = useRef(onSessionEvent)
  callbackRef.current = onSessionEvent

  useEffect(() => {
    if (!address) return

    const socket = io(API_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('register', address)
    })

    const handlers = EVENT_TYPES.map(type => {
      const handler = (payload: SessionEventPayload) => callbackRef.current(payload)
      socket.on(`session:${type}`, handler)
      return { type, handler }
    })

    socket.on('connect_error', (err) => {
      // Non-fatal — the dashboard still works via its initial fetch and
      // manual refresh, it just won't get instant push updates.
      console.warn('[useSocket] connection error (push updates unavailable):', err.message)
    })

    return () => {
      handlers.forEach(({ type, handler }) => socket.off(`session:${type}`, handler))
      socket.disconnect()
      socketRef.current = null
    }
  }, [address])
}