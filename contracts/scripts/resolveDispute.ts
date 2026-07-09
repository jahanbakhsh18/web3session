/**
 * Resolves a disputed session by releasing escrow to either the caller (refund-equivalent outcome) 
 * or the callee (release-equivalent outcome). Only callable by the address set as `arbitrator` in SessionRegistry 
 * (For this demo, that's the deployer wallet - see deploy.ts).
 *
 * Usage:
 *   $ DISPUTE_SESSION_ID=<Session ID> DISPUTE_WINNER=<caller or callee> npx hardhat run scripts/resolveDispute.ts --network sepolia
 *
 * WINNER must be exactly "caller" or "callee". 
 * The contract's own validation reverts with NotParty if you ever try to pay out to someone who isn't either party.
 */

import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const sessionId = process.env.DISPUTE_SESSION_ID
  const winnerRole = process.env.DISPUTE_WINNER

  if (!sessionId) {
    throw new Error('SESSION_ID env var is required, e.g. SESSION_ID=0')
  }
  if (winnerRole !== 'caller' && winnerRole !== 'callee') {
    throw new Error(`WINNER must be "caller" or "callee", got: ${winnerRole}`)
  }

  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')
  const { contracts } = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))

  const [signer] = await ethers.getSigners()
  const registry = await ethers.getContractAt('SessionRegistry', contracts.SessionRegistry)

  const session = await registry.getSession(sessionId)

  // Status enum: 0 Open, 1 Escrowed, 2 Active, 3 Completed, 4 Disputed, 5 Refunded
  if (Number(session.status) !== 4) {
    throw new Error(
      `Session #${sessionId} is not Disputed (current status index: ${session.status}). Nothing to resolve.`
    )
  }

  const winnerAddress = winnerRole === 'caller' ? session.caller : session.callee

  console.log(`\n─── Resolving dispute ──────────────────────────────────`)
  console.log(`Session:     #${sessionId}`)
  console.log(`Caller:      ${session.caller}`)
  console.log(`Callee:      ${session.callee}`)
  console.log(`Deposit:     ${ethers.formatEther(session.deposit)} ETH`)
  console.log(`Resolving in favor of: ${winnerRole} (${winnerAddress})`)
  console.log(`Arbitrator (you):      ${signer.address}\n`)

  const tx = await registry.resolveDispute(sessionId, winnerAddress)
  console.log(`Tx sent: ${tx.hash}`)
  console.log('Waiting for confirmation...')

  const block_explorer = process.env.BLOCK_EXPLORER_URL ?? '<BLOCK_EXPLORER_URL>'

  const receipt = await tx.wait()
  console.log(`✓ Confirmed in block ${receipt?.blockNumber}`)
  console.log(`  ${block_explorer}/tx/${tx.hash}`)
  console.log(`\n${ethers.formatEther(session.deposit)} ETH released to ${winnerRole} (${winnerAddress}).`)
}

main().catch(err => {
  console.error('\nFailed to resolve dispute:')
  console.error(err.message ?? err)
  process.exitCode = 1
})
