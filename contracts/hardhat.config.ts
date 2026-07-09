import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'

dotenv.config()

// Validate required env vars at config-load time so you get a clear error
// instead of a cryptic 'invalid sender' from the RPC.
function requireEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback
  if (!val) throw new Error(`Missing environment variable: ${key}`)
  return val
}

const PRIVATE_KEY    = process.env.PRIVATE_KEY    ?? '0x' + '0'.repeat(64)  // dummy for local
const RPC_URL     = process.env.RPC_URL     ?? ''
const BLOCK_EXPLORER_API_KEY  = process.env.BLOCK_EXPLORER_API_KEY ?? ''

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,      // optimize for typical usage frequency
      },
      viaIR: false,     // set true only if you hit stack-too-deep
    },
  },

  networks: {
    // Default: Hardhat in-process node (no config needed)
    hardhat: {
      chainId: 31337,
    },

    // Local node: `npx hardhat node` in a separate terminal
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
    },

    // Sepolia testnet
    sepolia: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      //timeout: 60000,
      chainId: 11155111,
      gasPrice: 'auto',
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/", // Public RPC
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 97, // BSC Testnet Chain ID
      gasPrice: 20000000000, // 20 gwei (optional, for faster tx)
    },
  },

  etherscan: {
    apiKey: BLOCK_EXPLORER_API_KEY
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    outputFile: 'gas-report.txt',
    noColors: true,
  },

  paths: {
    sources:   './contracts',
    tests:     './test',
    cache:     './cache',
    artifacts: './artifacts',
  },

  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
}

export default config
