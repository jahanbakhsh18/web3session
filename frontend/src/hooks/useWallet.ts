/**
 * Owns: browser wallet provider, signer, connected address, current chain ID, and the connect/disconnect lifecycle. 
 * Every other hook that needs to read from or write to a contract should consume `signer` or `provider` from here
 * rather than touching window.ethereum directly.
 *
 * Error states are explicit and surfaced as a typed union (`error.code`) rather than a free-text string, 
 * so the UI can render the right call-to-action for each case (install MetaMask vs. switch network vs. user rejected).
 */

import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { CHAIN_ID, CHAIN_ID_HEX, SEPOLIA_NETWORK_PARAMS } from '../config/contracts'

export type WalletErrorCode =
  | 'NO_PROVIDER'      // MetaMask (or any injected wallet) not installed
  | 'USER_REJECTED'    // user clicked "Cancel" in the MetaMask popup
  | 'WRONG_NETWORK'    // connected, but not on Sepolia
  | 'SWITCH_FAILED'    // network switch/add request itself failed
  | 'UNKNOWN'

export type WalletError = {
  code: WalletErrorCode
  message: string
}

export type WalletState = {
  address: string | null
  chainId: number | null
  isCorrectNetwork: boolean
  isConnecting: boolean
  error: WalletError | null
  provider: ethers.BrowserProvider | null
  signer: ethers.JsonRpcSigner | null
}

// Minimal typing for window.ethereum — avoids pulling in a full EIP-1193 dependency just for this.
type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void
}

function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    isCorrectNetwork: false,
    isConnecting: false,
    error: null,
    provider: null,
    signer: null,
  })

  const setError = (code: WalletErrorCode, message: string) =>
    setState(s => ({ ...s, error: { code, message }, isConnecting: false }))

  const connect = useCallback(async () => {
    const injected = getInjectedProvider()

    if (!injected) {
      setError('NO_PROVIDER', 'No wallet found. Install MetaMask to continue.')
      return
    }

    setState(s => ({ ...s, isConnecting: true, error: null }))

    try {
      const accounts = (await injected.request({ method: 'eth_requestAccounts' })) as string[]

      if (!accounts || accounts.length === 0) {
        setError('UNKNOWN', 'No accounts returned by wallet.')
        return
      }

      const provider = new ethers.BrowserProvider(injected as unknown as ethers.Eip1193Provider)
      const signer = await provider.getSigner()
      const network = await provider.getNetwork()
      const chainId = Number(network.chainId)

      setState({
        address: accounts[0],
        chainId,
        isCorrectNetwork: chainId === CHAIN_ID,
        isConnecting: false,
        error: chainId === CHAIN_ID
          ? null
          : { code: 'WRONG_NETWORK', message: `Connected to chain ${chainId}, expected Sepolia (${CHAIN_ID}).` },
        provider,
        signer,
      })
    } catch (err: unknown) {
      // EIP-1193 user rejection has code 4001
      const code = (err as { code?: number })?.code
      if (code === 4001) {
        setError('USER_REJECTED', 'Connection request was rejected.')
      } else {
        console.error('[useWallet] connect failed:', err)
        setError('UNKNOWN', 'Could not connect wallet. See console for details.')
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    // MetaMask has no programmatic disconnect — this just clears local state. 
    // The user can still fully disconnect from the MetaMask extension UI.
    setState({
      address: null,
      chainId: null,
      isCorrectNetwork: false,
      isConnecting: false,
      error: null,
      provider: null,
      signer: null,
    })
  }, [])

  const switchToSepolia = useCallback(async () => {
    const injected = getInjectedProvider()
    if (!injected) {
      setError('NO_PROVIDER', 'No wallet found. Install MetaMask to continue.')
      return
    }

    try {
      await injected.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }],
      })
      // A successful switch triggers the 'chainChanged' listener below, which re-syncs state — no need to manually update here.
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code

      // 4902 = chain not added to wallet yet — prompt to add it
      if (code === 4902) {
        try {
          await injected.request({
            method: 'wallet_addEthereumChain',
            params: [SEPOLIA_NETWORK_PARAMS],
          })
        } catch (addErr) {
          console.error('[useWallet] add chain failed:', addErr)
          setError('SWITCH_FAILED', 'Could not add Sepolia network to wallet.')
        }
      } else if (code === 4001) {
        setError('USER_REJECTED', 'Network switch was rejected.')
      } else {
        console.error('[useWallet] switch chain failed:', err)
        setError('SWITCH_FAILED', 'Could not switch network. Try switching manually in your wallet.')
      }
    }
  }, [])

  // Re-sync state when the user changes accounts or networks from inside 
  // the wallet UI itself (not through our connect/switch functions).
  useEffect(() => {
    const injected = getInjectedProvider()
    if (!injected) return

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[]
      if (accounts.length === 0) {
        disconnect()
      } else {
        // Re-run connect to refresh signer + address against the new account
        connect()
      }
    }

    const handleChainChanged = () => {
      // Simplest correct approach: reload the connection state entirely. 
      // Avoids subtly stale signer/provider references after a chain switch.
      connect()
    }

    injected.on('accountsChanged', handleAccountsChanged)
    injected.on('chainChanged', handleChainChanged)

    return () => {
      injected.removeListener('accountsChanged', handleAccountsChanged)
      injected.removeListener('chainChanged', handleChainChanged)
    }
  }, [connect, disconnect])

  return { ...state, connect, disconnect, switchToSepolia }
}
