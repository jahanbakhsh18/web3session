import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { useDashboard } from '../hooks/useDashboard'
import { useParticipationBalance } from '../hooks/useParticipationBalance'
import type { SessionSummary } from '../hooks/useDashboard'
import { StatusPill } from './StatusPill'

type Props = {
  address: string | null
  provider: ethers.Provider | null
  onOpenSession: (sessionId: string) => void
}

const ETHERSCAN_TX_BASE = 'https://sepolia.etherscan.io/tx/'

export function Dashboard({ address, provider, onOpenSession }: Props) {
  const { sessions, reputation, loading, error, refetch, lastEvent } = useDashboard(address)

  const [tokenRefreshSignal, setTokenRefreshSignal] = useState(0)
  
  useEffect(() => {
    if (lastEvent?.type === 'SessionCompleted') {
      setTokenRefreshSignal(n => n + 1)
    }
  }, [lastEvent])

  const { balance: tokenBalance } = useParticipationBalance(address, provider, tokenRefreshSignal)

  if (!address) {
    return <p className="note note-muted">Connect your wallet to see your dashboard.</p>
  }

  if (loading) {
    return <p className="note note-muted">Loading dashboard…</p>
  }

  if (error) {
    return (
      <div>
        <p className="note note-error mb-sm">{error}</p>
        <button onClick={() => refetch()} className="secondary">Retry</button>
      </div>
    )
  }

  return (
    <div className="stack-xl">
      <div className="row row-gap-md row-wrap">
        <ReputationCard reputation={reputation} address={address} />
        <ParticipationCard balance={tokenBalance} />
      </div>

      <div>
        <div className="eyebrow mb-sm">Session history</div>

        {sessions.length === 0 ? (
          <p className="note note-muted">
            No sessions yet — booked and received sessions will appear here.
          </p>
        ) : (
          <div className="stack-xs">
            {sessions.map(s => (
              <SessionRow
                key={s.session_id}
                session={s}
                myAddress={address}
                onOpen={() => onOpenSession(s.session_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ReputationCard({ reputation, address }: { reputation: ReturnType<typeof useDashboard>['reputation']; address: string }) {
  if (!reputation || reputation.count === 0) {
    return (
      <div className="reputation-card flex-1">
        <div className="eyebrow mb-sm">Reputation</div>
        <p className="note note-muted">
          No on-chain ratings yet for {shortenAddress(address)}.
        </p>
      </div>
    )
  }

  return (
    <div className="reputation-card flex-1">
      <div className="eyebrow mb-sm">Reputation</div>
      <div className="row row-gap-sm">
        <span className="reputation-score">{reputation.average?.toFixed(2)}</span>
        <span className="reputation-star">★</span>
        <span className="note note-muted">
          from {reputation.count} rating{reputation.count > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

/**
 * Minimal surfacing of ParticipationToken — a balance readout, nothing more. 
 * the token is a simple ERC-20 balance, not a history that needs its own timeline the way sessions and ratings do.
 */
function ParticipationCard({ balance }: { balance: bigint | null }) {
  const formatted = balance !== null ? ethers.formatUnits(balance, 18) : null

  return (
    <div className="reputation-card flex-1">
      <div className="eyebrow mb-sm">Participation Tokens</div>
      {formatted === null ? (
        <p className="note note-muted">Loading…</p>
      ) : (
        <div className="row row-gap-sm">
          <span className="reputation-score">{Number(formatted).toFixed(0)}</span>
          <span className="participation-token">W3SP</span>
          <span className="note note-muted">earned from sessions</span>
        </div>
      )}
    </div>
  )
}

function SessionRow({ session, myAddress, onOpen }: { session: SessionSummary; myAddress: string; onOpen: () => void }) {
  const isCaller = session.caller_address.toLowerCase() === myAddress.toLowerCase()
  const counterparty = isCaller ? session.callee_address : session.caller_address

  return (
    <div onClick={onOpen} className="session-row">
      <div>
        <div className="mono">
          №{session.session_id} · {isCaller ? 'booked' : 'received'} ·{' '}
          {shortenAddress(counterparty)}
        </div>
        <div className="note note-muted session-row-meta">
          {ethers.formatEther(session.deposit_wei)} ETH · {new Date(session.created_at_chain).toLocaleDateString()}
        </div>
      </div>

      <div className="row row-gap-md">
        <StatusPill status={session.status} />
        <a
          href={`${ETHERSCAN_TX_BASE}${session.created_tx_hash}`}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="mono tx-link"
        >
          tx
        </a>
      </div>
    </div>
  )
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 7)}…${address.slice(-5)}`
}