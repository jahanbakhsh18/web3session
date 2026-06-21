import type { useWallet } from '../hooks/useWallet'

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

type Props = {
  wallet: ReturnType<typeof useWallet>
}

export function ConnectWallet({ wallet }: Props) {
  const { address, isCorrectNetwork, isConnecting, error, connect, disconnect, switchToSepolia } = wallet

  if (address && isCorrectNetwork) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
          {shortenAddress(address)}
        </span>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    )
  }

  if (address && !isCorrectNetwork) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ color: '#b45309' }}>Wrong network</span>
        <button onClick={switchToSepolia}>Switch to Sepolia</button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={connect} disabled={isConnecting}>
        {isConnecting ? 'Connecting...' : 'Connect wallet'}
      </button>

      {error && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#b91c1c' }}>
          {error.code === 'NO_PROVIDER' ? (
            <span>
              No wallet found.{' '}
              <a href="https://metamask.io/download" target="_blank" rel="noreferrer">
                Install MetaMask
              </a>
            </span>
          ) : (
            error.message
          )}
        </div>
      )}
    </div>
  )
}
