# web3session

A decentralized consultation marketplace for Ethereum and BSC. Smart contracts handle session agreements, escrow, and on-chain reputation.

---

## What it does

1. **Alice** connects her wallet and books a 30-minute consultation slot with **Bob**, depositing currency into escrow.
2. **Bob** confirms availability on-chain and declares the time the session will start.
3. The session becomes `Active` and runs (shared scratchpad, or any external call, service or session tool of your choice).
4. Either party calls `completeSession()`. Escrow releases to Bob, and both parties earn a non-transferable participation token.
5. Alice and Bob rate each other. The score is stored permanently on-chain and compounds into reputation.

If Bob never confirms, Alice's money is refunded automatically after a configurable timeout. If there's a dispute, a lightweight arbitration path settles it without a third-party service.

---

**Contract addresses**

| Contract | Ethereum Testnet (Sepolia) Address | BSC Tesnet Address
|---|---|---|
| SessionRegistry | [`0x446bb...fa166`](https://sepolia.etherscan.io/address/0x446bbd951525F223024DfabB69EBA35346dfa166#code) | [`0xD156B...30aAE`](https://testnet.bscscan.com/address/0xD156BfbB380E2Ca2870af6F269B87ce035430aAE#code) |
| Escrow | [`0xe8c4B...BdC29`](https://sepolia.etherscan.io/address/0xe8c4B36026Ff5168DaDe4529f9efDD8bf49BdC29#code) | [`0x80416...b0004`](https://testnet.bscscan.com/address/0x804167221A82e80C2b73Ed394a9540E1Fbab0004#code) |
| Reputation | [`0x04C05...9c3AE`](https://sepolia.etherscan.io/address/0x04C05b90D619416198b6965E0491fe702d19c3AE#code) | [`0x58eA4...9Ee6e`](https://testnet.bscscan.com/address/0x58eA41b0fCf4dec1f19AD386FDFdB56E9F29Ee6e#code) |
| ParticipationToken | [`0xf4328...363B6`](https://sepolia.etherscan.io/address/0xf4328E6b125Bcc9B339C73166E06A53A57A363B6#code) | [`0x526A3...4f4eb`](https://testnet.bscscan.com/address/0x526A3D4e6BCCcCb4fE97E73053f7B4c36724f4eb#code)

All four contracts are verified (click any address above to read the source directly on Etherscan and Bscscan).

---

## Contract state machine

<p> <img src="docs/web3session.png" width="680" /> </p>

`SessionRegistry.sol` owns the lifecycle. `Escrow.sol` is a standalone vault that only the registry can move funds through. `Reputation.sol` stores a cumulative `(total, count)` score per address so the average can be computed precisely off-chain. `ParticipationToken.sol` is a non-transferable ERC-20 minted to both parties on a clean completion (a proof-of-participation reward, not a currency).

**Contracts** (`contracts/`): four Solidity contracts covering the full session lifecycle, an escrow vault, cumulative reputation scoring, and a non-transferable participation reward; a Hardhat test suite with 44 tests covering successful flow, timing gate, dispute resolution, and reward logic.

**Backend** (`backend/`): a Node.js/Express REST API backed by Postgres, a polling event indexer that mirrors on-chain session and rating events into the database, and a Socket.io signaling layer that pushes live updates to connected clients without polling.

**Frontend** (`frontend/`): a React/TypeScript app built with Vite; wallet connect with MetaMask, a dashboard with live push updates, a session certificate view with role-aware action buttons, and a custom CSS design system with no external UI framework.

### Design considerations and screenshots

<div align="center">
  <table>
    <tr>
      <td align="center" valign="top">
        <a href="./DESIGN.md">
          <img src="docs/web3session.png" width="200" alt="Application Demo" style="border: 3px solid #d0d7de; border-radius: 6px; background-color: #f6f8fa; margin: 8px 0 8px 0;">
        </a>
        <p><em><a href="./DESIGN.md">📐 Design Considerations</em></p>
      </td>
      <td align="center" valign="top" style="padding-left: 20px;">
        <a href="https://jahanbakhsh18.github.io/web3session/" target="_blank" rel="noopener noreferrer">
          <img src="docs/screenshots/1_dashboard_and_terminals.png" width="200" alt="Application Demo" style="border-radius: 6px;">
        </a>
        <p><em><a href="https://jahanbakhsh18.github.io/web3session/" target="_blank" rel="noopener noreferrer">📸 Application screenshots</a></em></p>
      </td>
    </tr>
  </table>
</div>

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/jahanbakhsh18/web3session.git
cd web3session/contracts

# 2. Contracts
cp .env.example .env           # fill PRIVATE_KEY, RPC_URL, BLOCK_EXPLORER_API_KEY, ...
npm install
npx hardhat compile
npx hardhat test               # full suite: successful path, timeout, dispute, ratings
npx hardhat node               # local node in a separate terminal
npx hardhat run scripts/deploy.ts --network localhost

# 3. Backend
cd ../backend
cp .env.example .env          # fill DATABASE_URL, RPC_URL, SESSION_REGISTRY_ADDRESS
npm install
docker compose up -d          # starts Postgres
npm run db:migrate
npm run dev                   # starts REST API + Socket.io + indexer together

# Verify it's running:
curl http://localhost:4000/health
curl http://localhost:4000/api/sessions/0xYOUR_ADDRESS
curl http://localhost:4000/api/reputation/0xYOUR_ADDRESS

# 4. Frontend
cd ../frontend
cp .env.example .env          # fill deployed contract addresses
npm install
npm run dev                   # http://localhost:5173
```

After any contract change, re-sync ABIs to the frontend and backend:

```bash
npm run copy-abis             # from repo root
```

---

## Tech stack

**Contracts**: Solidity 0.8.28, Hardhat, ethers.js v6, OpenZeppelin (ERC-20 base for `ParticipationToken`), `@nomicfoundation/hardhat-network-helpers` (for time manipulation in tests), Deployed and verified on Sepolia and BSC testnets.

**Backend**: Node.js, Express, Socket.io (for real-time push notifications), PostgreSQL (as a read-optimized mirror of on-chain state), `dotenv` for configuration, The indexer is a polling-based event listener that runs in-process alongside the REST API.

**Frontend**: React, TypeScript, Vite, ethers.js v6 (for all contract reads and writes), `socket.io-client` (for the live push layer).

---

## License

MIT