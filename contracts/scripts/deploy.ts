/**
 * Deploys all web3session contracts in order, wiring addresses correctly.
 * Saves deployed addresses to deployments.json for the frontend + verify script.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network localhost   # local node
 *   npx hardhat run scripts/deploy.ts --network sepolia     # testnet
 */

import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const [deployer] = await ethers.getSigners()

  console.log('\n─── web3session deployment ───────────────────────────────')
  console.log(`Network:  ${network.name}`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`)

  // *** Step 1: Pre-compute registry address ***
  // Escrow, Reputation, and ParticipationToken need the registry address in their constructors, but registry needs them first. 
  // We solve this by computing the address. The registry will occupy (deployer nonce + 3 = after Escrow + Reputation + ParticipationToken).
  const nonce = await ethers.provider.getTransactionCount(deployer.address)
  const registryAddress = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 3 })
  console.log(`Pre-computed registry address: ${registryAddress}`)

  // *** Step 2: Deploy Escrow ***
  console.log('\nDeploying Escrow...')
  const EscrowFactory = await ethers.getContractFactory('Escrow')
  const escrow = await EscrowFactory.deploy(registryAddress)
  await escrow.waitForDeployment()
  const escrowAddress = await escrow.getAddress()
  console.log(`  Escrow:     ${escrowAddress}`)

  // *** Step 3: Deploy Reputation ***
  console.log('Deploying Reputation...')
  const ReputationFactory = await ethers.getContractFactory('Reputation')
  const reputation = await ReputationFactory.deploy(registryAddress)
  await reputation.waitForDeployment()
  const reputationAddress = await reputation.getAddress()
  console.log(`  Reputation: ${reputationAddress}`)

  // *** Step 4: Deploy ParticipationToken ***
  console.log('Deploying ParticipationToken...')
  const TokenFactory = await ethers.getContractFactory('ParticipationToken')
  const token = await TokenFactory.deploy(registryAddress)
  await token.waitForDeployment()
  const tokenAddress = await token.getAddress()
  console.log(`  ParticipationToken:  ${tokenAddress}`)

  // *** Step 5: Deploy SessionRegistry ***
  console.log('Deploying SessionRegistry...')
  const RegistryFactory = await ethers.getContractFactory('SessionRegistry')
  const registry = await RegistryFactory.deploy(
    escrowAddress,
    reputationAddress,
    tokenAddress,
    deployer.address, // arbitrator = deployer for demo
  )
  await registry.waitForDeployment()
  const actualRegistryAddress = await registry.getAddress()

  if (actualRegistryAddress !== registryAddress) {
    throw new Error(
      `Registry address mismatch!\n` +
      `  Expected: ${registryAddress}\n` +
      `  Actual:   ${actualRegistryAddress}\n` +
      `  → Another transaction changed the nonce between pre-computation and deploy.`
    )
  }
  console.log(`  Registry:   ${actualRegistryAddress}`)

  // *** Step 6: Save deployments *** 
  const deployments = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      Escrow:              escrowAddress,
      Reputation:          reputationAddress,
      ParticipationToken:  tokenAddress,
      SessionRegistry:     actualRegistryAddress,
    },
  }

  const outPath = path.join(__dirname, '..', 'deployments.json')
  fs.writeFileSync(outPath, JSON.stringify(deployments, null, 2))
  console.log(`\nDeployments saved to: ${path.relative(process.cwd(), outPath)}`)

  console.log('\n─── Complete ──────────────────────────────────────────')
  console.log('Next steps:')
  console.log('  1. npm run copy-abis          (from repo root)')
  console.log('  2. Update frontend/.env and backend/.env with contract addresses')
  if (network.name === 'sepolia') {
    console.log('  3. npx hardhat run scripts/verify.ts --network sepolia')
  }
  console.log('')
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})