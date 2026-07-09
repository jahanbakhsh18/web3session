import { useState } from 'react'
import { ethers } from 'ethers'
import { useSession } from '../hooks/useSession'
import { BLOCK_EXPLORER_URL, CURRENCY_SYMBOL } from '../config/contracts'

type Props = {
  signer: ethers.JsonRpcSigner | null
  onCreated?: (sessionId: string) => void
}

export function BookSession({ signer, onCreated }: Props) {
  const { createSession, createState } = useSession(signer)

  const [calleeAddress, setCalleeAddress] = useState('')
  const [durationMins, setDurationMins] = useState(30)
  const [depositEth, setDepositEth] = useState('0.001')
  const [confirmTimeoutHours, setConfirmTimeoutHours] = useState(24)
  const [result, setResult] = useState<{ sessionId: string; txHash: string } | null>(null)

  const isBusy = createState.status === 'pending' || createState.status === 'confirming'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)

    if (!signer) return

    const outcome = await createSession(calleeAddress, durationMins, depositEth, confirmTimeoutHours)
    if (outcome) {
      setResult(outcome)
      onCreated?.(outcome.sessionId)
    }
  }

  if (!signer) {
    return <p className="note note-muted">Connect your wallet to book a session.</p>
  }

  return (
    <div>
      <div className="eyebrow mb-xs">New booking</div>
      <h2 className="form-heading">Lock a deposit and book a consultant</h2>

      <form onSubmit={handleSubmit} className="stack-md">
        <label className="field-label">
          Consultant address
          <input
            type="text"
            placeholder="0x…"
            value={calleeAddress}
            onChange={e => setCalleeAddress(e.target.value)}
            required
            className="full-width"
          />
        </label>

        <div className="field-row">
          <label className="field-label flex-1">
            Duration (min)
            <input
              type="number"
              min={5}
              value={durationMins}
              onChange={e => setDurationMins(Number(e.target.value))}
              required
              className="full-width"
            />
          </label>

          <label className="field-label flex-1">
            Deposit ({CURRENCY_SYMBOL})
            <input
              type="text"
              inputMode="decimal"
              value={depositEth}
              onChange={e => setDepositEth(e.target.value)}
              required
              className="full-width"
            />
          </label>
        </div>

        <label className="field-label">
          Confirm timeout (hours)
          <input
            type="number"
            min={1}
            value={confirmTimeoutHours}
            onChange={e => setConfirmTimeoutHours(Number(e.target.value))}
            required
            className="timeout-input"
          />
          <span className="timeout-hint">
            If the consultant doesn't confirm within this window, you can claim a refund.
          </span>
        </label>

        <button type="submit" disabled={isBusy} className="self-start">
          {createState.status === 'pending' && 'Opening wallet…'}
          {createState.status === 'confirming' && 'Waiting for confirmation…'}
          {(createState.status === 'idle' || createState.status === 'success' || createState.status === 'error') &&
            `Deposit ${depositEth} ${CURRENCY_SYMBOL} and book`}
        </button>

        {createState.status === 'confirming' && createState.txHash && (
          <p className="note note-muted mono">
            Transaction sent —{' '}
            <a href={`${BLOCK_EXPLORER_URL}/tx/${createState.txHash}`} target="_blank" rel="noreferrer">
              View on the blockchain explorer
            </a>
          </p>
        )}

        {createState.status === 'error' && (
          <p className="note note-error">{createState.error}</p>
        )}

        {result && (
          <div className="note-callout note-success">
            <strong>Session #{result.sessionId} created.</strong>
            <br />
            <a href={`${BLOCK_EXPLORER_URL}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
              View transaction on the blockchain explorer
            </a>
          </div>
        )}
      </form>
    </div>
  )
}
