/**
 * Verifies all deployed contracts on Etherscan using addresses from deployments.json.
 * Run after deploy.ts on Sepolia:
 *   npx hardhat run scripts/verify.ts --network sepolia
 */

import { run } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const deploymentsPath = path.join(__dirname, '..', 'deployments.json')

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error('deployments.json not found — run deploy.ts first')
  }

  const d = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  const { contracts, deployer } = d

  console.log('\n─── Etherscan verification ────────────────────────────')

  await verify('Escrow', contracts.Escrow, [contracts.SessionRegistry])
  await verify('Reputation', contracts.Reputation, [contracts.SessionRegistry])
  await verify('SessionRegistry', contracts.SessionRegistry, [
    contracts.Escrow,
    contracts.Reputation,
    deployer,
  ])
  await verify('ReputationToken', contracts.ReputationToken, [contracts.SessionRegistry])

  console.log('\n─── Done ──────────────────────────────────────────────\n')
}

async function verify(name: string, address: string, constructorArgs: unknown[]) {
  console.log(`\nVerifying ${name} at ${address}...`)
  try {
    await run('verify:verify', {
      address,
      constructorArguments: constructorArgs,
    })
    console.log(`  ✓ ${name} verified`)
  } catch (err: any) {
    if (err.message?.includes('Already Verified')) {
      console.log(`  ⚠ ${name} already verified`)
    } else {
      console.error(`  ✗ ${name} failed:`, err.message)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
