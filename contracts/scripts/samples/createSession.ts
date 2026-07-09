/**
 * Manually triggers a SessionCreated event on Sepolia so you can verify the backend indexer picks it up. 
 * Run from contracts/: 
 *  $ npx hardhat run scripts/samples/createSession.ts --network <sepolia or bscTestnet>
 *
 * Uses your test CALLER_KEY or deployer PRIVATE_KEY for the caller. For the callee use CALLEE_ADDRESS 
 * or the hardcoded test address below. Set CALLEE_ADDRESS if you want to test confirm() and complete() too.
 */

import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const deploymentsPath = path.join(__dirname, '../..', 'deployments.json')
  const { contracts } = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))

  const caller_key = (process.env.CALLER_KEY ?? process.env.PRIVATE_KEY) as string
  const callerSigner = new ethers.Wallet(caller_key, ethers.provider);

  const callee = process.env.CALLEE_ADDRESS ?? '0x000000000000000000000000000000000000dEaD'

  const durationSecs = 60 * 30      // 30 minutes
  const confirmTimeout = 60 * 60    // 1 hour
  const depositAmount = ethers.parseEther('0.0001') // small test amount

  console.log(`Creating session: ${callerSigner.address} → ${callee}`)
  console.log(`Deposit: ${ethers.formatEther(depositAmount)} ETH`)

  const registry = await ethers.getContractAt('SessionRegistry', contracts.SessionRegistry) as any

  const tx = await registry.connect(callerSigner).createSession(callee, durationSecs, confirmTimeout, {
    value: depositAmount,
  })

  console.log(`Tx sent: ${tx.hash}`)
  console.log('Waiting for confirmation...')

  const block_explorer = process.env.BLOCK_EXPLORER_URL ?? '<BLOCK_EXPLORER_URL>'

  const receipt = await tx.wait()
  console.log(`✓ Confirmed in block ${receipt?.blockNumber}`)
  console.log(`  ${block_explorer}/tx/${tx.hash}`)
  console.log('\nYour backend indexer should pick this up on its next poll.')
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
