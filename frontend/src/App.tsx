import { useState } from 'react'
import { ConnectWallet } from './components/ConnectWallet'
import { BookSession } from './components/BookSession'
import { SessionPage } from './components/SessionPage'
import { Dashboard } from './components/Dashboard'
import { Modal } from './components/Modal'
import { useWallet } from './hooks/useWallet'
import './styles/index.css'

type Overlay = { type: 'book' } | { type: 'session'; sessionId: string } | null

export default function App() {
  const wallet = useWallet()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [sessionIdInput, setSessionIdInput] = useState('')

  function openSession(sessionId: string) {
    setOverlay({ type: 'session', sessionId })
  }

  function closeOverlay() {
    setOverlay(null)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">web3session</h1>
          <div className="eyebrow app-tagline">
            On-chain consultation escrow — Sepolia testnet
          </div>
        </div>
        <ConnectWallet wallet={wallet} />
      </header>

      {wallet.address && wallet.isCorrectNetwork ? (
        <>
          <div className="dashboard-toolbar">
            <div className="eyebrow">Dashboard</div>
            <button onClick={() => setOverlay({ type: 'book' })}>
              Book a session
            </button>
          </div>

          <Dashboard address={wallet.address} onOpenSession={openSession} />

          <div className="section-divider">
            <label className="eyebrow" htmlFor="session-id-input">
              Open a session by ID
            </label>
            <form
              className="row row-gap-sm"
              onSubmit={e => {
                e.preventDefault()
                if (sessionIdInput.trim()) openSession(sessionIdInput.trim())
              }}
            >
              <input
                id="session-id-input"
                type="text"
                placeholder="Session ID, e.g. 0"
                value={sessionIdInput}
                onChange={e => setSessionIdInput(e.target.value)}
                className="flex-1"
              />
              <button type="submit" className="secondary">View</button>
            </form>
          </div>
        </>
      ) : (
        <p className="intro-copy">
          Connect your wallet on Sepolia to book a consultation session.
          Funds are held in an on-chain escrow contract and released only
          when both the lifecycle and the timing allow it.
        </p>
      )}

      {overlay?.type === 'book' && (
        <Modal onClose={closeOverlay}>
          <BookSession
            signer={wallet.signer}
            onCreated={sessionId => setOverlay({ type: 'session', sessionId })}
          />
        </Modal>
      )}

      {overlay?.type === 'session' && (
        <Modal onClose={closeOverlay}>
          <SessionPage
            sessionId={overlay.sessionId}
            signer={wallet.signer}
            provider={wallet.provider}
            connectedAddress={wallet.address}
          />
        </Modal>
      )}
    </div>
  )
}