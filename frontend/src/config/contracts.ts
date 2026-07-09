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

export const CHAIN_NAME = requireEnv('VITE_CHAIN_NAME')
export const CHAIN_ID = Number(requireEnv('VITE_CHAIN_ID'))
export const CHAIN_ID_HEX = requireEnv('VITE_CHAIN_ID_HEX')
export const CURRENCY_NAME = requireEnv('VITE_CURRENCY_NAME')
export const CURRENCY_SYMBOL = requireEnv('VITE_CURRENCY_SYMBOL')
export const RPC_URL = requireEnv('VITE_RPC_URL')
export const BLOCK_EXPLORER_URL = requireEnv('VITE_BLOCK_EXPLORER_URL')

export const API_URL = requireEnv('VITE_API_URL')

export const CONTRACT_ADDRESSES = {
  SessionRegistry: requireEnv('VITE_SESSION_REGISTRY_ADDRESS'),
  Escrow: requireEnv('VITE_ESCROW_ADDRESS'),
  Reputation: requireEnv('VITE_REPUTATION_ADDRESS'),
  ParticipationToken: requireEnv('VITE_PARTICIPATION_TOKEN_ADDRESS'),
} as const

// Network params, used when prompting MetaMask to add/switch the network.
export const NETWORK_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: CHAIN_NAME,
  nativeCurrency: { name: CURRENCY_NAME, symbol: CURRENCY_SYMBOL, decimals: 18 },
  rpcUrls: [RPC_URL], // public fallback only for the "add network" prompt
  blockExplorerUrls: [BLOCK_EXPLORER_URL],
}
