import { ethers } from 'ethers'
import { useSessionData } from '../hooks/useSessionData'
import { useSession } from '../hooks/useSession'
import { Countdown } from './Countdown'

type Props = {
  sessionId: string
  signer: ethers.JsonRpcSigner | null
  provider: ethers.Provider | null
  connectedAddress: string | null
}

const ETHERSCAN_TX_BASE = 'https://sepolia.etherscan.io/tx/'

function isSameAddress(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

export function SessionPage({ sessionId, signer, provider, connectedAddress }: Props) {
  const { data, loading, error, refetch } = useSessionData(sessionId, provider)
  const {
    confirmSession, confirmState,
    completeSession, completeState,
    disputeSession, disputeState,
    claimRefund, refundState,
  } = useSession(signer)

  if (loading && !data) {
    return <p style={{ color: '#666' }}>Loading session #{sessionId}...</p>
  }

  if (error) {
    return <p style={{ color: '#b91c1c' }}>{error}</p>
  }

  if (!data) {
    return <p style={{ color: '#666' }}>Session #{sessionId} not found.</p>
  }

  const isCaller = isSameAddress(connectedAddress, data.caller)
  const isCallee = isSameAddress(connectedAddress, data.callee)
  const isParty = isCaller || isCallee

  async function handleAction(action: () => Promise<string | null>) {
    const txHash = await action()
    if (txHash) {
      // Give the chain a moment past confirmation, then pull fresh state rather than trusting our own optimistic guess of the new status.
      setTimeout(refetch, 1500)
    }
  }

  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: '0 0 0.25rem' }}>Session #{data.id}</h2>
        <span
          style={{
            display: 'inline-block',
            padding: '0.15rem 0.6rem',
            borderRadius: 12,
            fontSize: '0.8rem',
            background: statusColor(data.status).bg,
            color: statusColor(data.status).fg,
          }}
        >
          {data.status}
        </span>
      </div>

      <dl style={{ fontSize: '0.9rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem', margin: 0 }}>
        <dt style={{ color: '#666' }}>Caller</dt>
        <dd style={{ fontFamily: 'monospace', margin: 0 }}>{data.caller}</dd>
        <dt style={{ color: '#666' }}>Callee</dt>
        <dd style={{ fontFamily: 'monospace', margin: 0 }}>{data.callee}</dd>
        <dt style={{ color: '#666' }}>Deposit</dt>
        <dd style={{ margin: 0 }}>{ethers.formatEther(data.deposit)} ETH</dd>
        <dt style={{ color: '#666' }}>Duration</dt>
        <dd style={{ margin: 0 }}>{Math.round(data.durationSecs / 60)} min</dd>
      </dl>

      {!isParty && (
        <p style={{ fontSize: '0.85rem', color: '#92400e', background: '#fffbeb', padding: '0.5rem', borderRadius: 4 }}>
          You're viewing this session as an observer — connect with the caller or callee wallet to take action.
        </p>
      )}

      {/* Escrowed: callee can confirm, caller can refund after timeout expires */}
      {data.status === 'Escrowed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.85rem' }}>
            Confirmation window:{' '}
            <Countdown
              targetUnixSecs={data.createdAt + data.confirmTimeout}
              expiredLabel="expired"
            />
          </p>

          {isCallee && (
            <button
              onClick={() => handleAction(() => confirmSession(sessionId))}
              disabled={confirmState.status === 'pending' || confirmState.status === 'confirming'}
            >
              {confirmState.status === 'confirming' ? 'Confirming...' : 'Confirm session'}
            </button>
          )}

          {isCaller && data.createdAt + data.confirmTimeout < Math.floor(Date.now() / 1000) && (
            <button
              onClick={() => handleAction(() => claimRefund(sessionId))}
              disabled={refundState.status === 'pending' || refundState.status === 'confirming'}
            >
              {refundState.status === 'confirming' ? 'Claiming refund...' : 'Claim refund'}
            </button>
          )}
        </div>
      )}

      {/* Active: either party can complete or dispute */}
      {data.status === 'Active' && isParty && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => handleAction(() => completeSession(sessionId))}
            disabled={completeState.status === 'pending' || completeState.status === 'confirming'}
          >
            {completeState.status === 'confirming' ? 'Completing...' : 'Mark complete'}
          </button>
          <button
            onClick={() => handleAction(() => disputeSession(sessionId))}
            disabled={disputeState.status === 'pending' || disputeState.status === 'confirming'}
            style={{ color: '#b91c1c' }}
          >
            {disputeState.status === 'confirming' ? 'Disputing...' : 'Raise dispute'}
          </button>
        </div>
      )}

      {data.status === 'Disputed' && (
        <p style={{ fontSize: '0.85rem', color: '#92400e' }}>
          This session is under dispute. The arbitrator will resolve it manually.
        </p>
      )}

      {data.status === 'Completed' && (
        <p style={{ fontSize: '0.85rem', color: '#065f46' }}>
          Session completed — escrow released to the callee.
          {isParty && ' TODO Rating...'}
        </p>
      )}

      {data.status === 'Refunded' && (
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          The callee never confirmed in time — the caller's deposit was refunded.
        </p>
      )}

      {[confirmState, completeState, disputeState, refundState].map((s, i) =>
        s.status === 'error' ? (
          <p key={i} style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{s.error}</p>
        ) : null
      )}

      {[confirmState, completeState, disputeState, refundState].map((s, i) =>
        s.status === 'confirming' && s.txHash ? (
          <p key={i} style={{ fontSize: '0.8rem' }}>
            <a href={`${ETHERSCAN_TX_BASE}${s.txHash}`} target="_blank" rel="noreferrer">
              View transaction on Etherscan
            </a>
          </p>
        ) : null
      )}
    </div>
  )
}

function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'Escrowed':  return { bg: '#fef3c7', fg: '#92400e' }
    case 'Active':    return { bg: '#dbeafe', fg: '#1e40af' }
    case 'Completed': return { bg: '#d1fae5', fg: '#065f46' }
    case 'Disputed':  return { bg: '#fee2e2', fg: '#991b1b' }
    case 'Refunded':  return { bg: '#f3f4f6', fg: '#4b5563' }
    default:          return { bg: '#f3f4f6', fg: '#4b5563' }
  }
}
