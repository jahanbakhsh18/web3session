import type { useWallet } from '../hooks/useWallet'
import { CHAIN_NAME } from '../config/contracts'

function shortenAddress(address: string): string {
  return `${address.slice(0, 7)}…${address.slice(-5)}`
}

type Props = {
  wallet: ReturnType<typeof useWallet>
}

export function ConnectWallet({ wallet }: Props) {
  const { address, isCorrectNetwork, isConnecting, error, connect, disconnect, switchToSelectedChain } = wallet

  if (address && isCorrectNetwork) {
    return (
      <div className="row row-gap-md">
        <span className="mono wallet-address-badge">
          <span className="wallet-dot" />
          {shortenAddress(address)}
        </span>
        <button onClick={disconnect} className="secondary">Disconnect</button>
      </div>
    )
  }

  if (address && !isCorrectNetwork) {
    return (
      <div className="row row-gap-md">
        <span className="eyebrow note-pending">Wrong network</span>
        <button onClick={switchToSelectedChain}>Switch to {CHAIN_NAME}</button>
      </div>
    )
  }

  return (
    <div className="text-right">
      <button onClick={connect} disabled={isConnecting}>
        {isConnecting ? 'Connecting…' : 'Connect wallet'}
      </button>

      {error && (
        <div className="wallet-error">
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