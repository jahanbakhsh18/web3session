/**
 * Single source of truth for chain config and deployed contract addresses, read from Vite env vars (frontend/.env). 
 * Import from here instead of reaching for import.meta.env directly.
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) {
    throw new Error(
      `Missing environment variable: ${key}. Did you copy frontend/.env.example to frontend/.env?`
    )
  }
  return value
}

export const CHAIN_ID = Number(requireEnv('VITE_CHAIN_ID'))
export const CHAIN_ID_HEX = requireEnv('VITE_CHAIN_ID_HEX')

export const API_URL = requireEnv('VITE_API_URL')

export const CONTRACT_ADDRESSES = {
  SessionRegistry: requireEnv('VITE_SESSION_REGISTRY_ADDRESS'),
  Escrow: requireEnv('VITE_ESCROW_ADDRESS'),
  Reputation: requireEnv('VITE_REPUTATION_ADDRESS'),
  ReputationToken: requireEnv('VITE_REPUTATION_TOKEN_ADDRESS'),
} as const

// Sepolia network params, used when prompting MetaMask to add/switch the network.
export const SEPOLIA_NETWORK_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: 'Sepolia',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.sepolia.org'], // public fallback only for the "add network" prompt
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
}
