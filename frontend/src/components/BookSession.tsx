import { useState } from 'react'
import { ethers } from 'ethers'
import { useSession } from '../hooks/useSession'

type Props = {
  signer: ethers.JsonRpcSigner | null
  onCreated?: (sessionId: string) => void
}

const ETHERSCAN_TX_BASE = 'https://sepolia.etherscan.io/tx/'

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
    return <p style={{ color: '#666' }}>Connect your wallet to book a session.</p>
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 420 }}>
      <label>
        Consultant address
        <input
          type="text"
          placeholder="0x..."
          value={calleeAddress}
          onChange={e => setCalleeAddress(e.target.value)}
          required
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      </label>

      <label>
        Duration (minutes)
        <input
          type="number"
          min={5}
          value={durationMins}
          onChange={e => setDurationMins(Number(e.target.value))}
          required
        />
      </label>

      <label>
        Deposit (ETH)
        <input
          type="text"
          inputMode="decimal"
          value={depositEth}
          onChange={e => setDepositEth(e.target.value)}
          required
        />
      </label>

      <label>
        Confirm timeout (hours)
        <input
          type="number"
          min={1}
          value={confirmTimeoutHours}
          onChange={e => setConfirmTimeoutHours(Number(e.target.value))}
          required
        />
        <span style={{ fontSize: '0.8rem', color: '#666', display: 'block' }}>
          If the consultant doesn't confirm within this window, you can claim a refund.
        </span>
      </label>

      <button type="submit" disabled={isBusy}>
        {createState.status === 'pending' && 'Opening wallet...'}
        {createState.status === 'confirming' && 'Waiting for confirmation...'}
        {(createState.status === 'idle' || createState.status === 'success' || createState.status === 'error') &&
          `Deposit ${depositEth} ETH and book`}
      </button>

      {createState.status === 'confirming' && createState.txHash && (
        <p style={{ fontSize: '0.85rem' }}>
          Transaction sent:{' '}
          <a href={`${ETHERSCAN_TX_BASE}${createState.txHash}`} target="_blank" rel="noreferrer">
            view on Etherscan
          </a>
        </p>
      )}

      {createState.status === 'error' && (
        <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{createState.error}</p>
      )}

      {result && (
        <div style={{ background: '#ecfdf5', padding: '0.75rem', borderRadius: 4, fontSize: '0.85rem' }}>
          <strong>Session #{result.sessionId} created.</strong>
          <br />
          <a href={`${ETHERSCAN_TX_BASE}${result.txHash}`} target="_blank" rel="noreferrer">
            View transaction on Etherscan
          </a>
        </div>
      )}
    </form>
  )
}
