/**
 * Reads a single session's current state directly from the SessionRegistry contract (not the backend mirror) 
 * This is the one place in the app where going straight to the chain is the right call, since the session page
 * needs to be authoritative and indexer lag (up to INDEXER_POLL_INTERVAL_MS) would otherwise show a stale status 
 * right after the user's own transaction.
 *
 * Polls on an interval rather than subscribing to events, for the same reason the backend indexer polls instead of subscribing: 
 * most RPC providers (including injected wallet providers proxying to one) don't reliably support eth_newFilter.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import SessionRegistryAbi from '../abis/SessionRegistry.json'
import { CONTRACT_ADDRESSES } from '../config/contracts'

export const SessionStatus = {
  0: 'Open',
  1: 'Escrowed',
  2: 'Active',
  3: 'Completed',
  4: 'Disputed',
  5: 'Refunded',
} as const

export type SessionStatusLabel = typeof SessionStatus[keyof typeof SessionStatus]

export type SessionData = {
  id: string
  caller: string
  callee: string
  deposit: bigint
  durationSecs: number
  createdAt: number          // unix seconds
  confirmedAt: number        // 0 if not yet confirmed
  confirmTimeout: number     // seconds
  status: SessionStatusLabel
  callerRating: number
  calleeRating: number
}

const POLL_INTERVAL_MS = 6000

export function useSessionData(
  sessionId: string | null,
  provider: ethers.Provider | null,
) {
  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Avoids a stale closure setting state after the component has moved on to a different sessionId (e.g. user navigates away mid-poll).
  const requestedIdRef = useRef(sessionId)
  requestedIdRef.current = sessionId

  const fetchOnce = useCallback(async () => {
    if (!sessionId || !provider) {
      setLoading(false)
      return
    }

    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.SessionRegistry, SessionRegistryAbi, provider)
      const raw = await contract.getSession(sessionId)

      // Guard against requests that resolve after the user has navigated to a different session.
      if (requestedIdRef.current !== sessionId) return

      const statusIndex = Number(raw.status) as keyof typeof SessionStatus

      setData({
        id: raw.id.toString(),
        caller: raw.caller,
        callee: raw.callee,
        deposit: raw.deposit,
        durationSecs: Number(raw.durationSecs),
        createdAt: Number(raw.createdAt),
        confirmedAt: Number(raw.confirmedAt),
        confirmTimeout: Number(raw.confirmTimeout),
        status: SessionStatus[statusIndex],
        callerRating: Number(raw.callerRating),
        calleeRating: Number(raw.calleeRating),
      })
      setError(null)
    } catch (err) {
      console.error('[useSessionData] fetch failed:', err)
      setError('Could not load session. It may not exist yet, or the RPC may be temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [sessionId, provider])

  useEffect(() => {
    setLoading(true)
    fetchOnce()

    const interval = setInterval(fetchOnce, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchOnce])

  return { data, loading, error, refetch: fetchOnce }
}
