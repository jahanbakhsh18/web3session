import { ethers } from 'ethers'
import { useDashboard } from '../hooks/useDashboard'
import type { SessionSummary } from '../hooks/useDashboard'
import { StatusPill } from './StatusPill'

type Props = {
  address: string | null
  onOpenSession: (sessionId: string) => void
}

const ETHERSCAN_TX_BASE = 'https://sepolia.etherscan.io/tx/'

export function Dashboard({ address, onOpenSession }: Props) {
  const { sessions, reputation, loading, error, refetch } = useDashboard(address)

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
        <button onClick={refetch} className="secondary">Retry</button>
      </div>
    )
  }

  return (
    <div className="stack-xl">
      <ReputationCard reputation={reputation} address={address} />

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
      <div className="reputation-card">
        <div className="eyebrow mb-sm">Reputation</div>
        <p className="note note-muted">
          No on-chain ratings yet for {shortenAddress(address)}.
        </p>
      </div>
    )
  }

  return (
    <div className="reputation-card">
      <div className="eyebrow mb-sm">Reputation</div>
      <div className="row row-gap-sm">
        <span className="reputation-score">{reputation.average?.toFixed(2)}</span>
        <span className="reputation-star">★</span>
        <span className="note note-muted">
          from {reputation.count} verified rating{reputation.count > 1 ? 's' : ''}
        </span>
      </div>
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
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}