/**
 * Sets up the ethers.js provider and SessionRegistry contract instance
 * used by the indexer to listen for and query past events.
 */

import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const RPC_URL  = process.env.RPC_URL
const REGISTRY_ADDRESS = process.env.SESSION_REGISTRY_ADDRESS

if (!RPC_URL) throw new Error('RPC_URL not set in backend/.env')
if (!REGISTRY_ADDRESS) throw new Error('SESSION_REGISTRY_ADDRESS not set in backend/.env')

// ABI is synced here by the root copy-abis script — see scripts/copy-abis.js
const abiPath = path.join(__dirname, '../abis/SessionRegistry.json')
const abi = JSON.parse(readFileSync(abiPath, 'utf8'))

export const provider = new ethers.JsonRpcProvider(RPC_URL)

export const sessionRegistry = new ethers.Contract(REGISTRY_ADDRESS, abi, provider)

export const REGISTRY_DEPLOY_ADDRESS = REGISTRY_ADDRESS
