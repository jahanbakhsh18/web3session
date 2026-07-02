# Changelog

## ParticipationToken wired in, completion-timing fix, 

- Renamed `ReputationToken.sol` to `ParticipationToken.sol` (avoid confusion with the unrelated `Reputation.sol`), added it as a fourth
constructor argument to `SessionRegistry`, and `completeSession()` now mints the reward to both parties on clean completion only — not on
`resolveDispute()`'s payout, since a disputed session didn't conclude cleanly. This meant a full four-contract redeploy (Escrow and Reputation's `registry` address is immutable, set once at construction, so they had to be redeployed alongside the registry rather than just adding one new contract on the side).

- **Found and fixed a real trust-model gap while testing.** The callee could `confirmSession()` and `completeSession()` back to back and drain escrow without ever delivering anything — there was no check that any time had actually passed. Fixed by having the callee declare `scheduledStart` at confirmation time (bounded between now and the original confirm-timeout deadline); the callee can only complete once `scheduledStart + durationSecs` has elapsed (This is documented in the [Design.md](./DESIGN.md)).

- Added `useSocket.ts` on the frontend, registers the connected wallet's room and exposes the live event stream; `useDashboard.ts` does a quiet background refetch whenever a push event touches the connected address. `SessionPage.tsx` deliberately keeps its own direct-from-chain polling unchanged — it needs to be authoritative immediately after the user's own transaction without depending on indexer or socket timing.

## Frontend Rating and dashboard

Added on-chain rating after session completion and a dashboard view backed by the indexer mirror.

- `rateCounterparty` added to `useSession.ts`; `SessionPage` shows a star picker in the `Completed` state, switching to a static confirmation once `getSession()` reports a non-zero rating for the connected role.
- Dashboard is the permanent home, always mounted with ConnectWallet in its own header. BookSession and SessionPage are Modal overlays, not alternate views. The dashboard lists many sessions, so it hits the backend's REST mirror (`/api/sessions/:address`) rather than re-scanning the chain. The session page stays on direct contract reads since it needs to be authoritative immediately after the user's own transaction, without indexer lag.
- Modal: bottom-sheet on mobile, centered dialog on desktop, closes via backdrop click, close button, or Escape.
- Responsive fixes: field-row/action-row/session-meta-grid classes collapse to single-column under their breakpoints instead of squeezing; header and session-card title rows wrap on narrow viewports.
- StatusPill.tsx: shared compact status badge, sourced from statusTheme.

## Frontend wallet connect, session lifecycle page

Added frontend wallet connect, booking flow, and session lifecycle page:

- useWallet: MetaMask connect/disconnect, network detection, switch-to-Sepolia, explicit error states (no provider, user rejected, wrong network)
- useSession: createSession, confirmSession, completeSession, disputeSession, claimRefund — each surfaces tx hash immediately, friendly error messages mapped from contract revert reasons
- useSessionData: polls a single session's state directly from the contract (not the backend mirror) so the page is authoritative right after a write
- BookSession: booking form, Etherscan link on submit, hands off to SessionPage on success
- SessionPage: live status pill, countdown to confirm deadline, role-aware action buttons (confirm/complete/dispute/refund) for the connected wallet
- Countdown: small reusable live timer component
- config/contracts.ts: typed env var access for chain config and addresses
- There's no arbitrator UI for resolving disputes. It is served by a CLI script (contracts/scripts/resolveDispute.ts) rather than a whole admin screen


## Backend event indexer + REST API

Added backend event indexer and REST API:

- src/db: schema.sql mirrors on-chain session/rating state, migration runner, shared Postgres pool
- src/indexer: polls SessionRegistry events via eth_getLogs (not eth_newFilter, which free-tier RPC providers commonly block), chunked
  and resumable via indexer_state table, exponential backoff on failure
- src/signaling: Socket.io push notifications keyed by wallet address room
- src/api: GET /sessions/:address, /sessions/:address/pending,/sessions/by-id/:sessionId, /reputation/:address
- docker-compose.yml: local Postgres for development