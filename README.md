# web3session

A decentralized consultation marketplace. Smart contracts handle session agreements, escrow, and on-chain reputation.

> **Demo status:** contracts written, tested locally and live on Sepolia
> **Testnet:** [Sepolia Etherscan →](https://sepolia.etherscan.io)

---

## What it does

1. **Alice** connects her wallet and books a 30-minute consultation slot with **Bob**, depositing ETH into escrow.
2. **Bob** confirms availability on-chain — the session becomes `Active`.
3. The session runs (shared scratchpad, or any external call tool of your choice).
4. Either party calls `complete()` — escrow releases to Bob proportionally.
5. Alice rates Bob — the score is stored permanently on-chain and compounds into Bob's reputation.

If Bob never confirms, Alice's ETH is refunded automatically after a configurable timeout. If there's a dispute, a lightweight arbitration path settles it without a third-party service.

---

**Contract addresses (Sepolia, chainId 11155111)**

| Contract | Address |
|---|---|
| SessionRegistry | [`0x526A3D4e6BCCcCb4fE97E73053f7B4c36724f4eb`](https://sepolia.etherscan.io/address/0x526A3D4e6BCCcCb4fE97E73053f7B4c36724f4eb#code) |
| Escrow | [`0x804167221A82e80C2b73Ed394a9540E1Fbab0004`](https://sepolia.etherscan.io/address/0x804167221A82e80C2b73Ed394a9540E1Fbab0004#code) |
| Reputation | [`0x58eA41b0fCf4dec1f19AD386FDFdB56E9F29Ee6e`](https://sepolia.etherscan.io/address/0x58eA41b0fCf4dec1f19AD386FDFdB56E9F29Ee6e#code) |
| ReputationToken | [`0x9f07800F7a2d0A2FfF1b314EEcfdec4a64fE858C`](https://sepolia.etherscan.io/address/0x9f07800F7a2d0A2FfF1b314EEcfdec4a64fE858C#code) |

All four contracts are verified — click any address above to read the source directly on Etherscan.

---

## Contract state machine

```
[Open] --deposit()--> [Escrowed] --confirm()--> [Active]
                           |                        |
                        timeout                complete() / dispute()
                           |                       /           \
                      [Refunded]            [Completed]      [Disputed]
                                             ETH→callee       arbitration
```

`SessionRegistry.sol` owns the lifecycle. `Escrow.sol` is a standalone vault that only the registry can move funds through. `Reputation.sol` stores a cumulative `(total, count)` score per address so the average can be computed precisely off-chain. `ReputationToken.sol` is a non-transferable ERC-20 minted to both parties on a clean completion — a proof-of-participation reward, not a currency.

---

## Quickstart

```bash
git clone https://github.com/jahanbakhsh18/web3session.git
cd web3session/contracts

cp .env.example .env           # fill PRIVATE_KEY + INFURA_URL + ETHERSCAN_API_KEY
npm install
npx hardhat compile
npx hardhat test               # full suite: happy path, timeout, dispute, ratings
npx hardhat node               # local node in a separate terminal
npx hardhat run scripts/deploy.ts --network localhost
```

Deployment to a local node or Sepolia comes next — not included in this commit.

---

## Roadmap

- [x] SessionRegistry, Escrow, Reputation, ReputationToken contracts
- [x] Full Hardhat test suite
- [x] Deploy and verify on Sepolia
- [ ] Backend event indexer + REST API
- [ ] Frontend wallet connect, booking flow, dashboard

---

## License

MIT
