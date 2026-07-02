import { useState } from 'react'
import { ethers } from 'ethers'
import { useSessionData } from '../hooks/useSessionData'
import { useSession } from '../hooks/useSession'
import { Countdown } from './Countdown'
import { StarRating } from './StarRating'
import { Stamp } from './Stamp'

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

function shorten(address: string): string {
  return `${address.slice(0, 7)}…${address.slice(-5)}`
}

/** Format a Date for a datetime-local input's value attribute (local time, no seconds). */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SessionPage({ sessionId, signer, provider, connectedAddress }: Props) {
  const { data, loading, error, refetch } = useSessionData(sessionId, provider)
  const {
    confirmSession, confirmState,
    completeSession, completeState,
    disputeSession, disputeState,
    claimRefund, refundState,
    rateCounterparty, rateState,
  } = useSession(signer)
  const [pendingScore, setPendingScore] = useState(0)
  const [scheduledStartInput, setScheduledStartInput] = useState(() => toDatetimeLocalValue(new Date()))

  if (loading && !data) {
    return <p className="note note-muted">Loading session #{sessionId}…</p>
  }

  if (error) {
    return <p className="note note-error">{error}</p>
  }

  if (!data) {
    return <p className="note note-muted">Session #{sessionId} not found.</p>
  }

  const isCaller = isSameAddress(connectedAddress, data.caller)
  const isCallee = isSameAddress(connectedAddress, data.callee)
  const isParty = isCaller || isCallee

  const nowSecs = Math.floor(Date.now() / 1000)
  const completableAt = data.scheduledStart + data.durationSecs
  const calleeCanComplete = nowSecs >= completableAt

  async function handleAction(action: () => Promise<string | null>) {
    const txHash = await action()
    if (txHash) {
      setTimeout(refetch, 1500)
    }
  }

  function handleConfirm() {
    const scheduledStart = Math.floor(new Date(scheduledStartInput).getTime() / 1000)
    handleAction(() => confirmSession(sessionId, scheduledStart))
  }

  return (
    <div className="session-card">
      <div className="session-card-notch" />

      <div className="session-card-body">
        <div className="session-card-header">
          <div>
            <div className="eyebrow">Session record</div>
            <h2 className="session-id">№&nbsp;{data.id}</h2>
          </div>
          <Stamp status={data.status} />
        </div>

        <dl className="session-meta-grid">
          <dt className="note-muted">Caller</dt>
          <dd className="mono">{shorten(data.caller)}</dd>
          <dt className="note-muted">Callee</dt>
          <dd className="mono">{shorten(data.callee)}</dd>
          <dt className="note-muted">Deposit</dt>
          <dd className="mono">{ethers.formatEther(data.deposit)} ETH</dd>
          <dt className="note-muted">Duration</dt>
          <dd className="mono">{Math.round(data.durationSecs / 60)} min</dd>
          {data.status !== 'Escrowed' && data.scheduledStart > 0 && (
            <>
              <dt className="note-muted">Scheduled start</dt>
              <dd className="mono">{new Date(data.scheduledStart * 1000).toLocaleString()}</dd>
            </>
          )}
        </dl>

        {!isParty && (
          <p className="note note-pending note-callout mb-sm">
            Viewing as an observer — connect with the caller or callee wallet to take action.
          </p>
        )}

        {/* Escrowed: callee picks a start time and confirms; caller can refund after timeout. */}
        {data.status === 'Escrowed' && (
          <div className="stack-sm">
            <p className="note">
              Confirmation window closes in{' '}
              <Countdown
                targetUnixSecs={data.createdAt + data.confirmTimeout}
                expiredLabel="— window expired"
              />
            </p>

            {isCallee && (
              <div className="stack-xs">
                <label className="field-label">
                  Scheduled start time
                  <input
                    type="datetime-local"
                    value={scheduledStartInput}
                    onChange={e => setScheduledStartInput(e.target.value)}
                    max={toDatetimeLocalValue(new Date((data.createdAt + data.confirmTimeout) * 1000))}
                  />
                  <span>
                    You won't be able to mark this session complete until {Math.round(data.durationSecs / 60)} minutes
                    after this time. The caller can end the session early at any point.
                  </span>
                </label>

                <button
                  onClick={handleConfirm}
                  disabled={confirmState.status === 'pending' || confirmState.status === 'confirming'}
                  className="self-start"
                >
                  {confirmState.status === 'confirming' ? 'Confirming…' : 'Confirm session'}
                </button>
              </div>
            )}

            {isCaller && data.createdAt + data.confirmTimeout < nowSecs && (
              <button
                onClick={() => handleAction(() => claimRefund(sessionId))}
                disabled={refundState.status === 'pending' || refundState.status === 'confirming'}
                className="secondary self-start"
              >
                {refundState.status === 'confirming' ? 'Claiming refund…' : 'Claim refund'}
              </button>
            )}
          </div>
        )}

        {/* Active: caller can complete any time; callee is gated until the scheduled session duration has actually elapsed. */}
        {data.status === 'Active' && isParty && (
          <div className="stack-sm">
            {isCallee && !calleeCanComplete && (
              <p className="note">
                You can mark this session as complete in {' '}
                <Countdown targetUnixSecs={completableAt} expiredLabel="now" />
              </p>
            )}

            <div className="action-row">
              {(isCaller || calleeCanComplete) && (
                <button
                  onClick={() => handleAction(() => completeSession(sessionId))}
                  disabled={completeState.status === 'pending' || completeState.status === 'confirming'}
                >
                  {completeState.status === 'confirming' ? 'Completing…' : 'Mark complete'}
                </button>
              )}
              <button
                onClick={() => handleAction(() => disputeSession(sessionId))}
                disabled={disputeState.status === 'pending' || disputeState.status === 'confirming'}
                className="danger"
              >
                {disputeState.status === 'confirming' ? 'Disputing…' : 'Raise dispute'}
              </button>
            </div>

            {isCaller && (
              <p className="note note-muted">
                Ending early forfeits the remaining scheduled time.
              </p>
              
            )}
          </div>
        )}

        {data.status === 'Disputed' && (
          <p className="note note-error">
            Under dispute — the arbitrator will resolve it manually.
          </p>
        )}

        {data.status === 'Completed' && (
          <div className="stack-sm">
            <p className="note note-success">
              Settled — escrow released to the callee.
            </p>

            {isParty && <RatingBlock
              isCaller={isCaller}
              callerRating={data.callerRating}
              calleeRating={data.calleeRating}
              pendingScore={pendingScore}
              setPendingScore={setPendingScore}
              rateState={rateState}
              onSubmit={() => handleAction(() => rateCounterparty(sessionId, pendingScore))}
            />}
          </div>
        )}

        {data.status === 'Refunded' && (
          <p className="note note-muted">
            The callee never confirmed in time — the caller's deposit was refunded.
          </p>
        )}

        {[confirmState, completeState, disputeState, refundState, rateState].map((s, i) =>
          s.status === 'error' ? (
            <p key={i} className="note note-error mt-sm">{s.error}</p>
          ) : null
        )}

        {[confirmState, completeState, disputeState, refundState, rateState].map((s, i) =>
          s.status === 'confirming' && s.txHash ? (
            <p key={i} className="note note-muted mono mt-sm">
              <a href={`${ETHERSCAN_TX_BASE}${s.txHash}`} target="_blank" rel="noreferrer">
                View transaction on Etherscan
              </a>
            </p>
          ) : null
        )}
      </div>
    </div>
  )
}

type RatingBlockProps = {
  isCaller: boolean
  callerRating: number
  calleeRating: number
  pendingScore: number
  setPendingScore: (n: number) => void
  rateState: { status: string; error: string | null }
  onSubmit: () => void
}

/**
 * Shows the rating UI for whichever party is connected. If the connected party has already rated 
 * (callerRating/calleeRating > 0, read straight from the contract's struct), shows a confirmation instead of the form.
 */
function RatingBlock({ isCaller, callerRating, calleeRating, pendingScore, setPendingScore, rateState, onSubmit }: RatingBlockProps) {
  const myRating = isCaller ? callerRating : calleeRating
  const isSubmitting = rateState.status === 'pending' || rateState.status === 'confirming'

  if (myRating > 0) {
    return (
      <p className="note note-muted">
        You rated the {isCaller ? 'callee' : 'caller'} {myRating} star{myRating > 1 ? 's' : ''}.
      </p>
    )
  }

  return (
    <div className="row row-gap-md">
      <StarRating value={pendingScore} onChange={setPendingScore} disabled={isSubmitting} />
      <button onClick={onSubmit} disabled={pendingScore === 0 || isSubmitting}>
        {rateState.status === 'confirming' ? 'Submitting…' : `Rate the ${isCaller ? 'callee' : 'caller'}`}
      </button>
    </div>
  )
}