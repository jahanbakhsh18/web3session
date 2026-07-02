/**
 * Reads the connected wallet's ParticipationToken balance directly 
 * from the contract, since this is a single ERC-20 balanceOf() call.
 *
 * This hook re-fetches whenever the caller bumps refreshSignal (Dashboard passes 
 * a counter that increments on every relevant SessionCompleted push it receives).
 */

import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import ParticipationTokenAbi from '../abis/ParticipationToken.json'
import { CONTRACT_ADDRESSES } from '../config/contracts'

export function useParticipationBalance(
  address: string | null,
  provider: ethers.Provider | null,
  refreshSignal: number,
) {
  const [balance, setBalance] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBalance = useCallback(async () => {
    if (!address || !provider) {
      setLoading(false)
      return
    }

    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.ParticipationToken, ParticipationTokenAbi, provider)
      const result = await contract.balanceOf(address)
      setBalance(result)
    } catch (err) {
      console.error('[useParticipationBalance] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [address, provider])

  useEffect(() => {
    fetchBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchBalance, refreshSignal])

  return { balance, loading }
}
