#!/usr/bin/env node
/**
 * copy-abis.js
 *
 * Copies compiled contract ABIs from Hardhat artifacts into the frontend.
 * Run this after any contract change: `npm run copy-abis` from repo root.
 *
 * Output: frontend/src/abis/<ContractName>.json  (ABI array only, not full artifact)
 */

const fs   = require('fs')
const path = require('path')

const ARTIFACTS_DIR = path.join(__dirname, 'contracts/artifacts/contracts')
const ABIS_OUT_DIR  = path.join(__dirname, 'frontend/src/abis')

const CONTRACTS = [
  'SessionRegistry',
  'Escrow',
  'Reputation',
  'ReputationToken',
]

fs.mkdirSync(ABIS_OUT_DIR, { recursive: true })

let copied = 0
let missing = 0

for (const name of CONTRACTS) {
  const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`)

  if (!fs.existsSync(artifactPath)) {
    console.warn(`  ⚠  ${name}.json not found — run 'npx hardhat compile' first`)
    missing++
    continue
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  const outPath  = path.join(ABIS_OUT_DIR, `${name}.json`)

  // Write only the ABI array — not the full artifact (bytecode stays in contracts/)
  fs.writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2))
  console.log(`  ✓  ${name} → frontend/src/abis/${name}.json`)
  copied++
}

console.log(`\nDone: ${copied} copied, ${missing} missing.\n`)
if (missing > 0) process.exit(1)
