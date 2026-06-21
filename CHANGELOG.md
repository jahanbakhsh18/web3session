# Changelog

## Backend event indexer + REST API

Added backend event indexer and REST API:

- src/db: schema.sql mirrors on-chain session/rating state, migration runner, shared Postgres pool
- src/indexer: polls SessionRegistry events via eth_getLogs (not eth_newFilter, which free-tier RPC providers commonly block), chunked
  and resumable via indexer_state table, exponential backoff on failure
- src/signaling: Socket.io push notifications keyed by wallet address room
- src/api: GET /sessions/:address, /sessions/:address/pending,/sessions/by-id/:sessionId, /reputation/:address
- docker-compose.yml: local Postgres for development

## Frontend wallet connect, booking flow

Added frontend wallet connect, booking flow, and session lifecycle page:

- useWallet: MetaMask connect/disconnect, network detection, switch-to-Sepolia, explicit error states (no provider, user rejected, wrong network)
- useSession: createSession, confirmSession, completeSession, disputeSession, claimRefund — each surfaces tx hash immediately, friendly error messages mapped from contract revert reasons
- useSessionData: polls a single session's state directly from the contract (not the backend mirror) so the page is authoritative right after a write
- BookSession: booking form, Etherscan link on submit, hands off to SessionPage on success
- SessionPage: live status pill, countdown to confirm deadline, role-aware action buttons (confirm/complete/dispute/refund) for the connected wallet
- Countdown: small reusable live timer component
- config/contracts.ts: typed env var access for chain config and addresses

- There's no arbitrator UI for resolving disputes. It is served by a CLI script (contracts/scripts/resolveDispute.ts) rather than a whole admin screen