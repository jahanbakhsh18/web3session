/**
 * Owns all interaction with the SessionRegistry contract: creating sessions, confirming, completing, disputing, and refunding. 
 * Each write function follows the same shape: set status to 'pending', send the tx, wait for one confirmation, 
 * surface the tx hash immediately (don't make the user wait for confirmation to see proof something happened), then resolve.
 *
 * This hook does NOT read session lists — that's the backend's job via the REST API, since querying chain history per-page-load 
 * doesn't scale and the indexer already mirrors it. This hook is for the live, one-shot write actions a connected wallet performs.
 */

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import SessionRegistryAbi from '../abis/SessionRegistry.json'
import { CONTRACT_ADDRESSES } from '../config/contracts'

export type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

export type TxState = {
  status: TxStatus
  txHash: string | null
  error: string | null
}

const IDLE: TxState = { status: 'idle', txHash: null, error: null }

/**
 * Maps common failure modes to a message a non-technical viewer can actually understand, instead of raw ethers/RPC error text.
 */
function describeError(err: unknown): string {
  const code = (err as { code?: number | string })?.code
  const message = (err as { message?: string })?.message ?? ''

if (code === 4001 || code === 'ACTION_REJECTED') { return 'Transaction was rejected in your wallet.' }
  if (message.includes('insufficient funds')) { return 'Insufficient ETH in your wallet to cover the deposit and gas.' }
  if (message.includes('SelfSession')) { return "You can't book a session with your own address." }
  if (message.includes('ZeroDeposit')) { return 'Deposit amount must be greater than zero.' }
  if (message.includes('ConfirmTimeoutNotExpired')) { return 'The confirmation window has not expired yet — refund is not available.' }
  if (message.includes('ConfirmTimeoutExpired')) { return 'The confirmation window has expired — this session can no longer be confirmed.' }
  if (message.includes('ScheduledStartInPast')) { return 'Scheduled start must be now or later, and within the confirmation window.' }
  if (message.includes('ScheduledStartAfterConfirmTimeout')) { return 'Scheduled start must be before the confirmation window.' }
  if (message.includes('SessionNotYetElapsed')) { return "The scheduled session hasn't finished yet — you can mark it complete once the duration has elapsed."  }
  if (message.includes('NotParty')) { return 'Only the caller or callee of this session can perform this action.' }
  if (message.includes('WrongStatus')) { return 'This action is not available in the session\'s current state.' }
  if (message.includes('InvalidRating')) { return 'Rating must be between 1 and 5 stars.' }
  if (message.includes('AlreadyRated')) { return "You've already rated this session." }

  console.error('[useSession] unhandled error:', err)
  return 'Transaction failed. See console for details.'
}

export function useSession(signer: ethers.JsonRpcSigner | null) {
  const [createState, setCreateState] = useState<TxState>(IDLE)
  const [confirmState, setConfirmState] = useState<TxState>(IDLE)
  const [completeState, setCompleteState] = useState<TxState>(IDLE)
  const [disputeState, setDisputeState] = useState<TxState>(IDLE)
  const [refundState, setRefundState] = useState<TxState>(IDLE)
  const [rateState, setRateState] = useState<TxState>(IDLE)

  const getContract = useCallback(() => {
    if (!signer) throw new Error('Wallet not connected')
    return new ethers.Contract(CONTRACT_ADDRESSES.SessionRegistry, SessionRegistryAbi, signer)
  }, [signer])

  /**
   * Books a session: locks ETH in escrow for the given callee.
   * @param calleeAddress  The consultant's wallet address.
   * @param durationMins   Session length in minutes (converted to seconds on-chain).
   * @param depositEth     ETH amount to lock, as a string (e.g. "0.01").
   * @param confirmTimeoutHours  Hours the callee has to confirm before refund unlocks.
   */
  const createSession = useCallback(async (
    calleeAddress: string,
    durationMins: number,
    depositEth: string,
    confirmTimeoutHours: number,
  ): Promise<{ sessionId: string; txHash: string } | null> => {
    setCreateState({ status: 'pending', txHash: null, error: null })

    try {
      if (!ethers.isAddress(calleeAddress)) {
        setCreateState({ status: 'error', txHash: null, error: 'Invalid callee address.' })
        return null
      }

      const contract = getContract()
      const durationSecs = durationMins * 60
      const confirmTimeoutSecs = confirmTimeoutHours * 60 * 60
      const value = ethers.parseEther(depositEth)

      const tx = await contract.createSession(calleeAddress, durationSecs, confirmTimeoutSecs, { value })

      // Surface the hash immediately — the UI can link to the explorer before the tx is even mined, which is reassuring during the wait.
      setCreateState({ status: 'confirming', txHash: tx.hash, error: null })

      const receipt = await tx.wait()

      // SessionCreated is the first event in the ABI's event list for this call; parse logs to extract the sessionId rather than 
      // guessing nextSessionId ourselves (avoids a race if someone else created a session in between).
      const parsedLog = receipt.logs
        .map((log: ethers.Log) => {
          try { return contract.interface.parseLog(log) } catch { return null }
        })
        .find((parsed: ethers.LogDescription | null) => parsed?.name === 'SessionCreated')

      const sessionId = parsedLog?.args?.[0]?.toString() ?? null

      setCreateState({ status: 'success', txHash: tx.hash, error: null })

      return sessionId ? { sessionId, txHash: tx.hash } : null
    } catch (err) {
      setCreateState({ status: 'error', txHash: null, error: describeError(err) })
      return null
    }
  }, [getContract])

  /**
   * @param sessionId         The session to confirm.
   * @param scheduledStart    Unix seconds the callee commits to starting at.
   *                          Must be >= now and <= the session's original confirm-timeout deadline.
   */
  const confirmSession = useCallback(async (sessionId: string, scheduledStart: number): Promise<string | null> => {
    setConfirmState({ status: 'pending', txHash: null, error: null })

    try {
      const contract = getContract()
      const tx = await contract.confirmSession(sessionId, scheduledStart)
      setConfirmState({ status: 'confirming', txHash: tx.hash, error: null })
      await tx.wait()
      setConfirmState({ status: 'success', txHash: tx.hash, error: null })
      return tx.hash
    } catch (err) {
      setConfirmState({ status: 'error', txHash: null, error: describeError(err) })
      return null
    }
  }, [getContract])

  const completeSession = useCallback(async (sessionId: string): Promise<string | null> => {
    setCompleteState({ status: 'pending', txHash: null, error: null })

    try {
      const contract = getContract()
      const tx = await contract.completeSession(sessionId)
      setCompleteState({ status: 'confirming', txHash: tx.hash, error: null })
      await tx.wait()
      setCompleteState({ status: 'success', txHash: tx.hash, error: null })
      return tx.hash
    } catch (err) {
      setCompleteState({ status: 'error', txHash: null, error: describeError(err) })
      return null
    }
  }, [getContract])

  const disputeSession = useCallback(async (sessionId: string): Promise<string | null> => {
    setDisputeState({ status: 'pending', txHash: null, error: null })

    try {
      const contract = getContract()
      const tx = await contract.disputeSession(sessionId)
      setDisputeState({ status: 'confirming', txHash: tx.hash, error: null })
      await tx.wait()
      setDisputeState({ status: 'success', txHash: tx.hash, error: null })
      return tx.hash
    } catch (err) {
      setDisputeState({ status: 'error', txHash: null, error: describeError(err) })
      return null
    }
  }, [getContract])

  const claimRefund = useCallback(async (sessionId: string): Promise<string | null> => {
    setRefundState({ status: 'pending', txHash: null, error: null })

    try {
      const contract = getContract()
      const tx = await contract.claimRefund(sessionId)
      setRefundState({ status: 'confirming', txHash: tx.hash, error: null })
      await tx.wait()
      setRefundState({ status: 'success', txHash: tx.hash, error: null })
      return tx.hash
    } catch (err) {
      setRefundState({ status: 'error', txHash: null, error: describeError(err) })
      return null
    }
  }, [getContract])

  const rateCounterparty = useCallback(async (sessionId: string, score: number): Promise<string | null> => {
    setRateState({ status: 'pending', txHash: null, error: null })

    try {
      if (score < 1 || score > 5) {
        setRateState({ status: 'error', txHash: null, error: 'Rating must be between 1 and 5 stars.' })
        return null
      }

      const contract = getContract()
      const tx = await contract.rateCounterparty(sessionId, score)
      setRateState({ status: 'confirming', txHash: tx.hash, error: null })
      await tx.wait()
      setRateState({ status: 'success', txHash: tx.hash, error: null })
      return tx.hash
    } catch (err) {
      setRateState({ status: 'error', txHash: null, error: describeError(err) })
      return null
    }
  }, [getContract])

  return {
    createSession, createState,
    confirmSession, confirmState,
    completeSession, completeState,
    disputeSession, disputeState,
    claimRefund, refundState,
    rateCounterparty, rateState,
  }
}
