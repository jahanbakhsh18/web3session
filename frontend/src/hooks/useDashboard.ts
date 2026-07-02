/**
 * Fetches from the backend REST API, not the chain directly. This is deliberately different from useSessionData.ts: 
 * a dashboard listing many sessions is exactly the read pattern the indexer mirror exists for.
 */

import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config/contracts'
import { useSocket } from './useSocket'
import type { SessionEventPayload } from './useSocket'

export type SessionSummary = {
  session_id: string
  caller_address: string
  callee_address: string
  deposit_wei: string
  duration_secs: number
  confirm_timeout: number
  status: string
  created_at_chain: string
  confirmed_at_chain: string | null
  completed_at_chain: string | null
  created_tx_hash: string
  last_event_tx_hash: string | null
}

export type ReputationSummary = {
  address: string
  count: number
  total: number
  average: number | null
  recentRatings: {
    session_id: string
    rater_address: string
    score: number
    tx_hash: string
    created_at: string
  }[]
}

export function useDashboard(address: string | null) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [reputation, setReputation] = useState<ReputationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Surfaces the most recent relevant push event so other parts of the dashboard (e.g. the participation-token 
  // balance) can react to the same socket stream without opening a second connection of their own. 
  const [lastEvent, setLastEvent] = useState<SessionEventPayload | null>(null)

  const fetchAll = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!address) {
      setLoading(false)
      return
    }

    if (!opts.quiet) setLoading(true)
    setError(null)

    try {
      const [sessionsRes, reputationRes] = await Promise.all([
        fetch(`${API_URL}/api/sessions/${address}`),
        fetch(`${API_URL}/api/reputation/${address}`),
      ])

      if (!sessionsRes.ok || !reputationRes.ok) {
        throw new Error(`Backend returned an error (sessions: ${sessionsRes.status}, reputation: ${reputationRes.status})`)
      }

      const sessionsData = await sessionsRes.json()
      const reputationData = await reputationRes.json()

      setSessions(sessionsData.sessions ?? [])
      setReputation(reputationData)
    } catch (err) {
      console.error('[useDashboard] fetch failed:', err)
      if (!opts.quiet) {
        setError('Could not reach the backend. Is it running on ' + API_URL + '?')
      }
    } finally {
      if (!opts.quiet) setLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Live push: the backend notifies both parties' rooms the instant the indexer processes a relevant on-chain event.
  const handleSessionEvent = useCallback((payload: SessionEventPayload) => {
    const isRelevant =
      address && (
        payload.caller.toLowerCase() === address.toLowerCase() ||
        payload.callee.toLowerCase() === address.toLowerCase()
      )
    if (isRelevant) {
      fetchAll({ quiet: true })
      setLastEvent(payload)
    }
  }, [address, fetchAll])

  useSocket(address, handleSessionEvent)

  return { sessions, reputation, loading, error, refetch: fetchAll, lastEvent }
}
