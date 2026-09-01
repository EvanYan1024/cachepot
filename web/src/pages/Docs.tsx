import type { ReactNode } from "react";
import { ArrowUpRight, BookOpen, Eye, Landmark, Lock, ScanLine, ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/Layout";
import { POOL_ADDRESS, VAULTS } from "@/lib/contracts";

const GITHUB = "https://github.com/EvanYan1024/cachepot";

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "round", label: "How a round works" },
  { id: "privacy", label: "Privacy boundary" },
  { id: "verifiability", label: "Verifiability" },
  { id: "draw", label: "The encrypted draw" },
  { id: "custody", label: "Principal custody" },
  { id: "contracts", label: "Contracts" },
];

const COMPARISON = [
  { what: "Deposit amounts & balances", pt: "public", cp: "encrypted euint64 — only you can decrypt" },
  { what: "Draw weights (TWAB)", pt: "public", cp: "encrypted time-weighted balances" },
  { what: "Randomness", pt: "Chainlink VRF (external oracle)", cp: "FHE.randEuint64() — protocol-native, ciphertext from birth" },
  { what: "Winning vault", pt: "public", cp: "encrypted" },
  { what: "Winner identity", pt: "public", cp: "encrypted — only the winner learns they won" },
  { what: "Whether anyone won at all", pt: "public", cp: "encrypted — a win and a rollover are indistinguishable on-chain" },
];

const ROUND_STEPS = [
  {
    title: "Deposit / withdraw",
    body: "Users deposit ERC7984 confidential tokens into a vault. Balances and lazily-settled TWAB accumulators live entirely in ciphertext. Withdrawals have no lockup; outgoing amounts are clamped with FHE.min so a silently-failed confidential transfer can never desynchronize the ledger.",
  },
  {
    title: "Close",
    body: "Once the round period elapses, anyone calls closeRound(). The pool draws FHE.randEuint64(): a ciphertext random number nobody — deployer, validators, MEV searchers — can predict or peek at.",
  },
  {
    title: "Scan",
    body: "Anyone advances advanceDraw(batch). Each vault runs an encrypted prefix-sum scan over its participants' TWAB weights. FHEVM's per-transaction HCU budget caps a batch at six participants, so the scan is a resumable state machine — encrypted accumulators persist across transactions.",
  },
  {
    title: "Credit",
    body: "Vaults submit each user's encrypted winner flag; the pool computes the payout with FHE.select(win, prize, 0). A global encrypted awarded flag guarantees at most one payout per round, even against a malicious vault — which is what makes vault registration safely permissionless.",
  },
  {
    title: "Claim",
    body: "The winner sees their balance jump via user-side decryption (EIP-712 signed — only they can decrypt) and claims prize tokens whenever they like. Prizes and principal are separate encrypted ledgers, so a cWETH saver wins a cUSDT prize cleanly.",
  },
];

const PRIVACY_ROWS = [
  { info: "Individual deposits, balances, TWAB weights", status: "Encrypted", why: "Only the owner can decrypt" },
  { info: "Who won — and that anyone won", status: "Encrypted", why: "Every saver receives one homomorphic credit; all but one are zero" },
  { info: "Which vault won", status: "Encrypted", why: "The vault-selection comparison never leaves ciphertext" },
  { info: "Prize size, round schedule, per-vault contribution", status: "Public", why: "A lottery advertises its jackpot; plaintext contributions make odds auditable without an oracle" },
  { info: "Deposit / withdraw transactions (address, timing)", status: "Public", why: "Inherent chain metadata" },
];

const VERIFIABILITY = [
  {
    title: "The rules are immutable",
    body: "Contracts are open source, immutable after deployment, and have no admin path. The selection algorithm — target = (rand × totalWeight) >> 64, then an encrypted prefix-sum scan — is fixed on-chain for anyone to audit against the deployed bytecode.",
  },
  {
    title: "The execution is replayable",
    body: "A draw is not a server's answer; it is a chain of public, permissionless transactions — closeRound, advanceDraw batches, creditBatch, skipVault. Who advanced what, and when, is all in calldata and events. The Past draws table is rebuilt purely from those events.",
  },
  {
    title: "The randomness cannot be gamed",
    body: "FHE.randEuint64() is the protocol-level CSPRNG, generated inside transaction execution and encrypted from the moment it exists. No public seed to grind, no oracle callback to front-run — even validators cannot see the value, so they cannot discard unfavorable blocks.",
  },
  {
    title: "Ciphertext math is consensus, not assertion",
    body: "Every FHE operation executes deterministically as part of the FHEVM protocol. Values that do become public go through KMS threshold-signature decryption, verified on-chain by FHE.checkSignatures with replay guards — no single party can forge a decryption.",
  },
  {
    title: "Plaintext anchors keep the odds checkable",
    body: "Per-vault contributions are deliberately public, so each vault's win-probability interval is computable by anyone from public data. What is encrypted is the person-level dimension: individual deposits, weights, and the winner.",
  },
];

const ALGORITHM = [
  { code: "rand = FHE.randEuint64()", body: "Sample unpredictable randomness — no public seed, no oracle." },
  { code: "vaultHit = (target ≥ cumStart) ∧ (target < cumEnd)", body: "Select a vault in ciphertext over public contribution intervals." },
  { code: "cum += weight[i];  hit = FHE.lt(target, cum)", body: "Scan encrypted time-weighted balances in bounded batches." },
  { code: "prize[u] += FHE.select(win, reserve, 0)", body: "Credit everyone, pay one — the writes are indistinguishable." },
];

const HCU = [
  { step: "closeRound", cost: "2.7 M", note: "randomness + odds intervals" },
  { step: "advanceDraw / saver", cost: "2.55 M", note: "TWAB settle + compare + credit" },
  { step: "advanceDraw / 6 savers", cost: "≈ 15.3 M", note: "below the 20 M per-tx ceiling" },
];

const CUSTODY = [
  {
    title: "The strategist controls timing, not custody",
    body: "sweepToEarn can only move funds to the official deposit batcher, never to a wallet. Sweeping principal out is the single strategist-gated call.",
  },
  {
    title: "A lost key can never strand principal",
    body: "redeemFromEarn is permissionless: anyone can recall cShares into the withdrawal buffer, since extra liquidity only ever helps withdrawers and the shares can go nowhere but the official redeem batcher.",
  },
  {
    title: "Withdrawals degrade, never lose",
    body: "withdraw clamps to what the buffer actually holds (FHE.min against the vault's own confidential balance), so a swept-out vault can never silently burn a user's ledger — covered by a dedicated red-green test.",
  },
  {
    title: "Batches cannot be griefed",
    body: "Rescuing a canceled Earn batch via quitEarn is permissionless, while quitting a still-pending one — which would undo the deployment — is reserved for the strategist.",
  },
];

const CONTRACTS: { name: string; address: string; note?: string }[] = [
  { name: "CachePrizePool", address: POOL_ADDRESS },
  ...VAULTS.map((meta) => ({
    name: `CacheVault (${meta.symbol})`,
    address: meta.vault,
    note: meta.earn ? "principal deploys into Zama Earn" : undefined,
  })),
  { name: "USDT faucet (prize underlying)", address: VAULTS[0].underlying, note: "public mint" },
];

export function Docs() {
  return (
    <>
      <PageHead
        eyebrow="Documentation"
        title="How CachePot works"
        lede="The full protocol: what stays encrypted, what stays public, and how anyone can verify a draw they cannot see."
        aside={
          <a href={GITHUB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start text-sm font-medium hover:underline">
            <BookOpen className="size-4" /> Source & design doc <ArrowUpRight className="size-4" />
          </a>
        }
      />

      <div className="w-full pb-16">
        <nav aria-label="On this page" className="mb-10 flex flex-wrap gap-2">
          {TOC.map((entry) => (
            <a key={entry.id} href={`#${entry.id}`} className="status-chip hover:border-foreground/30 hover:text-foreground">
              {entry.label}
            </a>
          ))}
        </nav>

        <Section id="overview" icon={<Eye className="size-4" />} title="Overview">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            CachePot is a confidential no-loss lottery: deposit confidential tokens, keep your principal withdrawable at
            any time, and win the pooled yield. PoolTogether proved the mechanism; CachePot rebuilds it in the encrypted
            domain, where your deposit, your odds, and even the winner's identity are ciphertext end-to-end. The
            anonymity set is every saver across every vault — each round, every participant's prize ledger receives one
            homomorphic write, and observers cannot tell the winner's from anyone else's.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium"></th>
                  <th className="py-2 pr-4 font-medium">PoolTogether V5</th>
                  <th className="py-2 font-medium">CachePot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-y border-border align-top">
                {COMPARISON.map((row) => (
                  <tr key={row.what}>
                    <td className="py-3 pr-4 font-medium">{row.what}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.pt}</td>
                    <td className="py-3">{row.cp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="round" icon={<ScanLine className="size-4" />} title="How a round works">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Every call below is permissionless — there is no admin path. A stalled or junk vault cannot halt the
            protocol: after a one-hour grace period, anyone can skipVault() and the round completes without it.
          </p>
          <ol className="mt-6 border-t border-border">
            {ROUND_STEPS.map((step, index) => (
              <li key={step.title} className="grid gap-3 border-b border-border py-5 sm:grid-cols-[3.5rem_1fr] sm:gap-6">
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                <div>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="privacy" icon={<Lock className="size-4" />} title="Privacy boundary">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            CachePot separates what the protocol must prove from what the public needs to know. The split is deliberate
            and honest — chain metadata is not magically hidden.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Information</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-y border-border align-top">
                {PRIVACY_ROWS.map((row) => (
                  <tr key={row.info}>
                    <td className="py-3 pr-4 font-medium">{row.info}</td>
                    <td className="py-3 pr-4">
                      <span className={`status-chip ${row.status === "Encrypted" ? "border-primary bg-primary/15 text-foreground" : ""}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="verifiability" icon={<ShieldCheck className="size-4" />} title="Verifiability without visibility">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            "Verifiable on-chain" does not require the data to be public — it requires the program and the process to
            be. Anyone can confirm the draw followed the published rules and that no party could interfere, without ever
            learning who won.
          </p>
          <div className="mt-6 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {VERIFIABILITY.map((entry, index) => (
              <div key={entry.title} className="bg-background p-5">
                <div className="font-mono text-xs text-muted-foreground">0{index + 1}</div>
                <h3 className="mt-2 text-sm font-semibold">{entry.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{entry.body}</p>
              </div>
            ))}
            <div className="bg-foreground p-5 text-background">
              <div className="font-mono text-xs text-background/60">∴</div>
              <h3 className="mt-2 text-sm font-semibold">The honest boundary</h3>
              <p className="mt-2 text-xs leading-relaxed text-background/70">
                Third parties cannot recompute which address won — that is the point. What they verify is that nobody,
                including us, could predict, steer, or forge the draw. The trust floor is the Zama protocol's
                threshold cryptography, not any operator.
              </p>
            </div>
          </div>
        </Section>

        <Section id="draw" icon={<ScanLine className="size-4" />} title="The encrypted draw, measured">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_.65fr]">
            <ol className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
              {ALGORITHM.map((step, index) => (
                <li key={step.code} className="bg-background p-5">
                  <div className="font-mono text-xs text-muted-foreground">0{index + 1}</div>
                  <code className="mt-3 block overflow-x-auto bg-secondary px-3 py-2 font-mono text-[11px]">{step.code}</code>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
            <div>
              <div className="label text-muted-foreground">Measured HCU</div>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {HCU.map((row) => (
                  <div key={row.step} className="flex items-start justify-between gap-4 py-3 text-xs">
                    <div>
                      <div className="font-mono">{row.step}</div>
                      <div className="mt-0.5 text-muted-foreground">{row.note}</div>
                    </div>
                    <span className="font-mono tabular whitespace-nowrap">{row.cost}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Division by an encrypted total is unavailable on FHEVM, so the target point uses fixed-point scaling:
                (rand × totalWeight) &gt;&gt; 64. The batch size of six is what keeps a scan transaction under the
                sequential HCU depth limit.
              </p>
            </div>
          </div>
        </Section>

        <Section id="custody" icon={<Landmark className="size-4" />} title="Principal custody: Zama Earn">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The cUSDC vault puts idle principal to work inside Zama's Confidential Vault — the same rails as Zama Earn,
            where the Steakhouse Prime USDC market on Morpho runs on mainnet. Deposits join a batch via
            confidentialTransferAndCall; only the batch total is ever decrypted, and the position returns as
            confidential cShares. Four properties keep it safe:
          </p>
          <div className="mt-6 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
            {CUSTODY.map((entry) => (
              <div key={entry.title} className="bg-background p-5">
                <h3 className="text-sm font-semibold">{entry.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{entry.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Zama's docs mark the Sepolia vault "idle purposes only — no yield adapter", which matches our measurements
            (a constant 1.0 exchange rate). Testnet prizes are therefore simulated by the keeper through the same
            permissionless contribute() a production liquidator would call: contribute() takes plain tokens, verifies
            the amount on-chain, wraps them confidential, and buys the vault its odds. On mainnet, the identical wiring
            earns real Morpho yield — harvested surplus flows through the same function.
          </p>
        </Section>

        <Section id="contracts" icon={<BookOpen className="size-4" />} title="Contracts on Sepolia">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <tbody className="divide-y divide-border border-y border-border">
                {CONTRACTS.map((row) => (
                  <tr key={row.address}>
                    <td className="py-3 pr-4 font-medium whitespace-nowrap">{row.name}</td>
                    <td className="py-3 pr-4">
                      <a
                        href={`https://sepolia.etherscan.io/address/${row.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs break-all underline decoration-border underline-offset-4 hover:decoration-foreground"
                      >
                        {row.address}
                      </a>
                    </td>
                    <td className="py-3 text-xs whitespace-nowrap text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            cUSDT / cUSDC / cWETH are Zama's official confidential token wrappers — CachePot deliberately mints no token
            of its own. Full design document, FHEVM constraint analysis and security arguments live in the{" "}
            <a href={GITHUB} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:decoration-foreground">
              repository
            </a>
            .
          </p>
        </Section>
      </div>
    </>
  );
}

function Section({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-border py-10 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}
