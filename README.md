# CachePot

<p align="center">
  <img src="web/public/brand/cachepot-crystal-vault.png" alt="CachePot" width="420" />
</p>

**A confidential no-loss lottery on [Zama FHEVM](https://docs.zama.ai/protocol).**
Deposit confidential tokens, keep your principal withdrawable at any time, and win the pooled yield — while your deposits, balances, time-weighted odds, **and even the winner's identity stay encrypted end-to-end**. Every step of the draw happens in permissionless on-chain transactions, so anyone can verify the lottery is fair without learning who won.

> *cachepot* (French): a decorative pot made to conceal what's inside. A pot built for hiding — holding a confidential prize pool.

Built for the **Zama Developer Program — Mainnet Season 4 Bounty Track** ("Build a Confidential Lottery on PoolTogether"). Deep-dive design doc (Chinese): [DESIGN.md](DESIGN.md).

## Why this is different

PoolTogether proves "no-loss lottery" works, but on a public chain everyone sees your deposit size, your odds, and who won. CachePot rebuilds the mechanism in the encrypted domain:

| | PoolTogether V5 | CachePot |
|---|---|---|
| Deposit amounts & balances | public | **encrypted** (`euint64`, only you can decrypt) |
| Draw weights (TWAB) | public | **encrypted** time-weighted balances |
| Randomness | Chainlink VRF (external oracle) | **`FHE.randEuint64()`** — protocol-native, ciphertext from birth, unpredictable even to validators |
| Winning vault | public | **encrypted** |
| Winner identity | public | **encrypted** — only the winner learns they won, by decrypting their own balance |
| Prize claiming | claimer bots + VRGDA | prize is credited homomorphically — it just appears in your encrypted balance |

The anonymity set is *every depositor across every vault*: each round, every participant's prize ledger receives one homomorphic write — the winner gets the prize, everyone else gets an encrypted zero. On-chain observers cannot tell the difference, and cannot even tell which vault won.

## Architecture

Two layers, mirroring PoolTogether V5's prize-pool/vault split — chosen because it is naturally FHE-friendly: cross-vault odds need no price oracle (contributions are settled in the prize token, so they can stay plaintext), while everything about *people* stays ciphertext.

```
                 ┌──────────────────────────────────────────┐
                 │             CachePrizePool               │
                 │  prize token: cUSDT (ERC7984)            │
                 │  contribution[vault]   ← plaintext ✓     │
                 │  round scheduling + encrypted randomness │
                 │  _prizeBalance[user]   ← encrypted       │
                 └──────────────────────────────────────────┘
                     ▲ creditBatch(users, encryptedFlags)
          ┌──────────┴───────────┬──────────────────┐
    ┌─────┴─────┐         ┌──────┴────┐      ┌──────┴────┐
    │ CacheVault│         │ CacheVault│      │ CacheVault│
    │   cUSDT   │         │   cUSDC   │      │   cWETH   │
    │ encrypted │         │ encrypted │      │ encrypted │
    │   TWAB    │         │   TWAB    │      │   TWAB    │
    └───────────┘         └───────────┘      └───────────┘
```

**How a round works** (every call is permissionless — there is no admin path):

1. **Deposit / withdraw** — users deposit ERC7984 confidential tokens into a vault. Balances and lazily-settled TWAB accumulators live entirely in ciphertext. Withdrawals have no lockup; outgoing amounts are clamped with `FHE.min` so a failed confidential transfer can never desynchronize the ledger.
2. **Close** — once the round period elapses, anyone calls `closeRound()`. The pool draws `FHE.randEuint64()`: a ciphertext random number nobody (deployer, validators, MEV searchers) can predict or peek at.
3. **Scan** — anyone advances `advanceDraw(batch)`. Each vault runs an encrypted prefix-sum scan over its participants' TWAB weights; the target point uses fixed-point scaling (`(rand × totalWeight) >> 64`) to avoid FHEVM's plaintext-divisor limitation. FHEVM's per-transaction HCU budget caps a batch at ~6–7 participants, so the scan is a resumable state machine — encrypted accumulators persist across transactions.
4. **Credit** — vaults submit each user's encrypted winner flag; the *pool* computes the payout (`FHE.select(win, prize, 0)`), and a global encrypted `_awarded` flag guarantees at most one payout per round even against a malicious vault. Vault registration is therefore permissionless.
5. **Claim** — the winner sees their balance jump via user-side decryption (EIP-712 signed, only they can decrypt) and claims prize tokens whenever they like. Prizes and principal are separate encrypted ledgers, so a cWETH depositor can win a cUSDT prize cleanly.

A stalled or junk vault can't halt the protocol: after a grace period, anyone can `skipVault()` and the round completes without it.

## Privacy boundary (honest edition)

| Information | Status |
|---|---|
| Individual deposits, balances, TWAB weights | encrypted — only the owner can decrypt |
| Who won, and that they won | encrypted — only the winner knows |
| Which vault won | encrypted |
| Prize size, round schedule, participant count, per-vault contribution | public (by design — a lottery advertises its jackpot) |
| The existence of a deposit/withdraw transaction (address, timing) | public (inherent chain metadata) |

## Verifiability

- **Randomness**: generated by the protocol-level CSPRNG inside a transaction, encrypted from the moment it exists. No oracle to trust, nothing to front-run.
- **Selection logic**: immutable contracts, permissionless calls, events on every batch — the full draw is replayable from calldata.
- **Decryption**: any value made public goes through KMS threshold signatures verified on-chain with `FHE.checkSignatures`, with per-round replay guards.
- **Ledger**: prizes are credited through the same encrypted ledger as deposits; a winner's claim reconciles on-chain.

## Deployed on Sepolia

| Contract | Address |
|---|---|
| CachePrizePool | [`0xd337eFCcB99016F0195852d19ac6828afe866C87`](https://sepolia.etherscan.io/address/0xd337eFCcB99016F0195852d19ac6828afe866C87) |
| CacheVault (cUSDT) | `0xf50aa1f9B6308da1a82dcCC2Cb1B8c516F8D3548` |
| CacheVault (cUSDC) | `0xD46e927bD3Ccf55788e986C9B952C0ce37ac2344` |
| CacheVault (cWETH) | `0x2F7aC339a995cF7135Ba955b87fdd3bb6045F3Ab` |
| cUSDT / cUSDC / cWETH | official Zama confidential token wrappers |
| USDTMock (prize underlying) | `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0` — public `mint`, doubles as the faucet |

CachePot deliberately does not mint its own token: vaults accept any existing `IERC7984` asset from the ecosystem.

## Repository layout

```
contracts/   Hardhat project — CachePrizePool, CacheVault, tests, deploy scripts
  scripts/keeper.ts    permissionless cron bot that advances draws (runs via GitHub Actions every 5 min)
  scripts/rehearse.ts  full end-to-end rehearsal against Sepolia
web/         Vite + React frontend — RainbowKit + @zama-fhe/sdk (encrypt inputs, user-decrypt balances)
DESIGN.md    full technical design: FHEVM constraints, HCU measurements, security arguments
```

## Run it

**Contracts**

```bash
cd contracts
npm install
npm test                                   # full suite on the FHEVM mock network
npx hardhat vars set DEPLOYER_PRIVATE_KEY  # for live networks
npx hardhat deploy --network sepolia
npx hardhat run scripts/keeper.ts --network sepolia   # advance the current round manually
```

**Web**

```bash
cd web
npm install
npm run dev
```

User journey: mint mock USDT from the faucet → wrap into cUSDT → deposit encrypted amount → watch the countdown → (anyone) push the draw forward → decrypt your balance to find out if you won.

## Production roadmap

Scoped out for the demo, with interfaces left in place:

- **Real yield**: Sepolia has no rate market, so prizes are funded by a mock yield injection through the same verified `transferFrom → wrap` path a real liquidator would use. Production swaps this for Aave/ERC4626 yield liquidation — exactly PoolTogether V5's contribution step.
- **Scaling the scan**: participant slots are capped per vault for the demo; production adds slot reuse and sharded scans (and can trade weight precision for half the HCU cost if needed).
- **Multiple winners**: N winners = N independent random targets accumulated in the same scan pass, at far less than N× cost.

## License

BSD-3-Clause-Clear — see [contracts/LICENSE](contracts/LICENSE).
