import { useState } from 'react'
import { ConnectWallet } from './components/ConnectWallet'
import { BookSession } from './components/BookSession'
import { SessionPage } from './components/SessionPage'
import { useWallet } from './hooks/useWallet'

export default function App() {
  const wallet = useWallet()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionIdInput, setSessionIdInput] = useState('')

  return (
    <div style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1
          style={{ fontSize: '1.25rem', margin: 0, cursor: 'pointer' }}
          onClick={() => setActiveSessionId(null)}
        >
          web3session
        </h1>
        <ConnectWallet wallet={wallet} />
      </header>

      {activeSessionId ? (
        <SessionPage
          sessionId={activeSessionId}
          signer={wallet.signer}
          provider={wallet.provider}
          connectedAddress={wallet.address}
        />
      ) : wallet.address && wallet.isCorrectNetwork ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <BookSession signer={wallet.signer} onCreated={setActiveSessionId} />

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
              Open an existing session
            </label>
            <form
              onSubmit={e => {
                e.preventDefault()
                if (sessionIdInput.trim()) setActiveSessionId(sessionIdInput.trim())
              }}
              style={{ display: 'flex', gap: '0.5rem' }}
            >
              <input
                type="text"
                placeholder="Session ID (e.g. 0)"
                value={sessionIdInput}
                onChange={e => setSessionIdInput(e.target.value)}
              />
              <button type="submit">View</button>
            </form>
          </div>
        </div>
      ) : (
        <p style={{ color: '#666' }}>
          Connect your wallet on Sepolia to book a consultation session.
        </p>
      )}
    </div>
  )
}
