# Design considerations

This document covers the non-obvious architectural decisions in web3session, and why the actual implementation looks the way it does. If you're just trying to run the project, see the main [README](./README.md) instead.

---

## Why completion is asymmetric

When **the callee** confirms, they declare `scheduledStart` (any time from now until the original confirm-timeout deadline). From that point, **the callee** can only call `completeSession()` once `scheduledStart + durationSecs` has actually elapsed. **The caller** faces no such limitation — ending early already forfeits the unused time they paid for. That's not a contract-level penalty, just the natural consequence of the deposit model: the caller loses out, so the contract doesn't need to enforce anything extra on their side.

This only verifies **elapsed wall-clock time**, not actual attendance. A callee could confirm, wait out the duration, and claim the deposit — the gate stops **instant-drain** attacks, but not no-shows. Tying completion to real attendance is out of scope for this demo. One remedy available in the application is that the caller can **raise a dispute** after a period has elapsed since `scheduledStart` in the event of the callee's absence, and also assign them a **one-star rating**."

## Why the indexer polls instead of subscribing

Free-tier RPC providers (Infura, Alchemy free plans, public endpoints like 1RPC) commonly disable `eth_newFilter`, which `ethers.js` needs for live event subscriptions. The indexer instead polls with `eth_getLogs` on a timer (`INDEXER_POLL_INTERVAL_MS`, default 8s), chunked to a configurable block range (`INDEXER_CHUNK_SIZE`) to stay within whatever range limit the RPC provider enforces. On failure, it retries with exponential backoff rather than repeating the same broken call indefinitely.

## Why the dashboard and session page read from different sources

`SessionPage.tsx` reads a session's state directly from the contract, polling every 6 seconds. This is the one place in the app where going straight to the chain is the right call, since the page needs to be authoritative immediately after the connected wallet's own transaction, without waiting on indexer lag. `Dashboard.tsx`, by contrast, reads from the backend's Postgres mirror via REST, since listing many sessions is exactly the read pattern that mirror exists for (re-scanning the chain for "all sessions involving address X" on every dashboard load would be slow and wasteful). The dashboard also subscribes to the backend's Socket.io signaling layer for live push updates, so a session confirmed or completed in one browser tab is reflected in another without a manual refresh or waiting for the next poll interval.

## Why ParticipationToken doesn't have its own activity feed

The frontend reads the connected wallet's token balance directly from the contract (`balanceOf()`) rather than through the backend. It's a single ERC-20 read, not a list that benefits from a database mirror the way session and rating history do — building a full reward-activity timeline was deliberately out of scope for this demo.

## Why ParticipationToken isn't minted on dispute resolution

`completeSession()` mints the participation reward to both parties; `resolveDispute()` does not, even though both ultimately release the same escrowed deposit. A disputed session didn't conclude cleanly regardless of who the arbitrator sides with. Therefore, the reward specifically marks "this session ran its course without needing arbitration," not just "money changed hands."

## Why Escrow and Reputation are separate contracts from SessionRegistry

`Escrow.sol` and `Reputation.sol` could have been mappings inside `SessionRegistry` directly. Keeping them separate means each is independently auditable (an explorer or auditor can read exactly what controls fund movement without wading through lifecycle logic), and the registry's own logic stays focused on state transitions rather than custody or scoring. Both are locked to accept calls only from the registry's address, set once at construction. Note that there's no way to redirect either contract to trust a different caller later, which is a deliberate simplicity tradeoff for a demo (a production system would likely want this upgradeable behind a timelock).
