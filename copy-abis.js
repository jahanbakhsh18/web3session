#!/usr/bin/env node
/**
 * Copies compiled contract ABIs from Hardhat artifacts into both the frontend and backend.
 * Run this after any contract change: npm run copy-abis   (from repo root)
 *
 * Output:
 *   frontend/src/abis/<ContractName>.json  (ABI array only, not full artifact)
 *   backend/src/abis/<ContractName>.json   (same — backend indexer needs it too)
 */

const fs   = require('fs')
const path = require('path')

const ARTIFACTS_DIR = path.join(__dirname, 'contracts/artifacts/contracts')

const OUT_DIRS = [
  path.join(__dirname, 'frontend/src/abis'),
  path.join(__dirname, 'backend/src/abis'),
]

const CONTRACTS = [
  'SessionRegistry',
  'Escrow',
  'Reputation',
  'ParticipationToken',
]

for (const dir of OUT_DIRS) {
  fs.mkdirSync(dir, { recursive: true })
}

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
  // Write only the ABI array — not the full artifact (bytecode stays in contracts/)
  const abiJson = JSON.stringify(artifact.abi, null, 2)

  for (const dir of OUT_DIRS) {
    const outPath = path.join(dir, `${name}.json`)
    fs.writeFileSync(outPath, abiJson)
    console.log(`  ✓  ${name} → ${path.relative(__dirname, outPath)}`)
  }
  copied++
}

console.log(`\nDone: ${copied} copied, ${missing} missing.\n`)
if (missing > 0) process.exit(1)