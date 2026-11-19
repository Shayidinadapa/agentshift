# AgentShift

**Turn a Binance Agent ID into a daily job.** Holders mint a free soulbound Worker NFT, clock in once a day to start a 24-hour shift, and earn SHIFT tokens from a fixed on-chain reserve while their shift runs.

Built for the [Binance Agent ID Hackathon](https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf) (submission period 18 Nov – 9 Dec 2026). Live at: https://muse.ai/s/agentshift-qxe6xkxcxqxuxn6xgxy/Vvyae3d8HVSShlY0RhQvDqMakpGTTovbwOCCiUwqs4E

## How it works

1. **Mint a Worker (free, gas only)** — any wallet holding a SPACE ID Agent ID (`.ai`) mints one soulbound Worker NFT. One Worker per Agent ID holder, non-transferable.
2. **Clock in once a day** — starts a 24-hour shift. Rewards accrue ONLY while a shift is active; no passive accrual.
3. **Claim SHIFT** — 100 SHIFT/day base rate, +5% per consecutive-day streak (max +50% at streak 11+). Streak resets if you miss more than 48 hours.

## Contracts (BNB Chain, chain 56)

All verified on BscScan (Sourcify `exact_match`).

| Contract | Address |
|---|---|
| WorkerNFT (ASW, ERC721 soulbound) | [`0x8837BD107a6E8812bDe0eeB6adEC089F53F9Bcc2`](https://bscscan.com/address/0x8837BD107a6E8812bDe0eeB6adEC089F53F9Bcc2#code) |
| ShiftToken v2 (SHIFT, ERC20, 10M fixed supply) | [`0x9ca4E76EB3dA3cD20a80D3Be4CF262302295a854`](https://bscscan.com/address/0x9ca4E76EB3dA3cD20a80D3Be4CF262302295a854#code) |
| ShiftMine v2 (clock-in / claim / streaks) | [`0xa8aaCd3681e245EFA6C6292769150e948C07A17F`](https://bscscan.com/address/0xa8aaCd3681e245EFA6C6292769150e948C07A17F#code) |

Fixed 10,000,000 SHIFT supply: 5,000,000 in the mining reserve, 5,000,000 with the deployer. No further minting. ShiftMine has no owner functions after its one-time `initialize()` — the mining rules are immutable.

Agent ID reference (not ours): SPACE ID Agent ID [`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`](https://bscscan.com/address/0x60b9262456de011f7d15a54cdd8c48baaa8b022f#code).

## Agent ID integration

Agent ID is the identity layer of the whole product:

- **Identity verification** — `WorkerNFT.mint()` reverts unless the caller holds an Agent ID (`balanceOf > 0` on the Agent ID contract).
- **Access control** — only Agent ID holders can mint; only the Worker owner can `clockIn` / `claim`.
- **Identity binding** — one soulbound Worker per Agent ID holder, bound 1:1 to that agent's identity.

## Development

Requires Node.js 22+.

```bash
npm install
node compile.mjs   # compile contracts with solc 0.8.26
node test.mjs      # 31 tests on a local ganache chain (all passing)
```

Deployment used the EIP-2470 Singleton Factory (`0xce0042B868300000d44A59004Da54A005ffdcf9f`) via CREATE2; see `prep-deploy-v2.mjs` and `deploy-one.mjs`. Verification via Sourcify v2 (`verify.mjs`).

The website in `frontend/` is a read-only static page that reads live on-chain state (Workers minted, mining reserve, streaks).

## Status

Live on mainnet since 18 Nov 2026. Mint → clock-in → claim verified end-to-end with two wallets. Workers minted by the community are visible on-chain.

No promised returns: SHIFT is earned by showing up for daily shifts, not guaranteed income.
