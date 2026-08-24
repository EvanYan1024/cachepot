import { useState } from "react";
import { Check, ChevronDown, CircleDot, Gavel } from "lucide-react";
import { useAccount } from "wagmi";
import { AmountField } from "@/components/AmountField";
import { PageHead } from "@/components/Layout";
import { PrizeAmount } from "@/components/PrizeAmount";
import { TokenIcon } from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";
import { VAULTS, parseAmount } from "@/lib/contracts";
import { formatCountdown } from "@/hooks/useNow";
import { usePoolActions, usePrizeAmount, useRound, useVaultStats, useWrongNetwork } from "@/hooks/usePool";
import { useTx } from "@/hooks/useTx";

const ALGORITHM = [
  {
    title: "Sample unpredictable randomness",
    code: "rand = FHE.randEuint64()",
    body: "The protocol CSPRNG returns an encrypted value, leaving no public seed to grind or oracle callback to front-run.",
  },
  {
    title: "Select a vault in ciphertext",
    code: "vaultHit = (target ≥ cumStart) ∧ (target < cumEnd)",
    body: "Public contribution intervals make the odds auditable, while the comparison result stays encrypted.",
  },
  {
    title: "Scan time-weighted balances",
    code: "cum += weight[i]; hit = FHE.lt(target, cum)",
    body: "Each vault walks its encrypted saver weights in bounded batches without revealing balances or comparisons.",
  },
  {
    title: "Credit everyone, pay one",
    code: "prize[u] += FHE.select(win, reserve, 0)",
    body: "Every saver receives an encrypted credit. All but one are zero, and an encrypted awarded flag prevents a second payout.",
  },
];

const HCU = [
  { step: "closeRound", cost: "2.7 M", note: "randomness + odds intervals" },
  { step: "advanceDraw / saver", cost: "2.55 M", note: "TWAB + compare + credit" },
  { step: "advanceDraw / 6", cost: "≈ 15.3 M", note: "below the 20 M ceiling" },
];

export function Prize() {
  const round = useRound();
  const stats = useVaultStats();
  const prize = usePrizeAmount(round.reserveHandle);
  const actions = usePoolActions();
  const { busy, run } = useTx();
  const { isConnected } = useAccount();
  const wrongNetwork = useWrongNetwork();
  const [sponsor, setSponsor] = useState("50");
  const [sponsorVault, setSponsorVault] = useState(VAULTS[0].vault);

  const period = round.roundPeriod !== undefined ? Number(round.roundPeriod) : undefined;
  const elapsedPct =
    period && round.secondsLeft !== undefined
      ? Math.min(100, Math.max(0, ((period - round.secondsLeft) / period) * 100))
      : 0;
  const funded = stats.filter((entry) => (entry.contribution ?? 0n) > 0n);
  const finished = funded.filter((entry) => entry.drawn).length;
  const drawPct = round.drawing && funded.length > 0 ? (finished / funded.length) * 100 : 0;
  const progress = round.drawing ? drawPct : elapsedPct;

  return (
    <>
      <PageHead
        eyebrow={round.roundId !== undefined ? `Round ${round.roundId}` : "Draw"}
        title="Private draw operations"
        lede="Round state, prize reserve and vault odds stay public. The selected vault and winning wallet never do."
        aside={
          <span className={`status-chip self-start ${round.drawing ? "border-primary bg-primary/15 text-foreground" : ""}`}>
            <span className={`size-1.5 rounded-full ${round.drawing ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
            {round.state === undefined ? "Loading" : round.drawing ? "Drawing" : "Round open"}
          </span>
        }
      />

      <div className="w-full">
      <section className="product-subtle my-6 grid overflow-hidden sm:grid-cols-3">
        {[
          { n: "01", label: "Accrue", detail: round.drawing ? "Window closed" : "TWAB active", active: !round.drawing },
          { n: "02", label: "Scan", detail: round.drawing ? `${finished}/${funded.length} vaults` : "Encrypted target", active: round.drawing },
          { n: "03", label: "Credit", detail: "Winner stays sealed", active: false },
        ].map((phase) => (
          <div
            key={phase.n}
            className={`flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0 ${
              phase.active ? "bg-primary/20 text-foreground" : ""
            }`}
          >
            <span className={`text-xs ${phase.active ? "text-foreground/65" : "text-muted-foreground"}`}>
              {phase.n}
            </span>
            <div>
              <div className="text-sm font-semibold">{phase.label}</div>
              <div className={`mt-0.5 text-xs ${phase.active ? "text-foreground/65" : "text-muted-foreground"}`}>
                {phase.detail}
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 pb-8 lg:grid-cols-[.82fr_1.18fr]">
        <section className="product-panel p-6 sm:p-7">
          <div className="label text-muted-foreground">Prize reserve</div>
          <PrizeAmount
            amount={prize.data}
            unavailable={prize.isError || wrongNetwork}
            className="mt-3 text-5xl sm:text-6xl"
          />
          <p className="mt-3 text-sm text-muted-foreground">Publicly decryptable. Unpaid prizes roll into the next round.</p>

          <div className="mt-8 border-t border-border pt-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="label text-muted-foreground">{round.drawing ? "Draw progress" : "Next close"}</div>
                <div className="mt-2 font-mono text-base tabular">
                  {round.drawing
                    ? `${finished} / ${funded.length} vaults`
                    : round.secondsLeft === undefined
                      ? "—"
                      : round.secondsLeft > 0
                        ? formatCountdown(round.secondsLeft)
                        : "Ready now"}
                </div>
              </div>
              <span className="font-mono text-xs text-muted-foreground tabular">{Math.round(progress)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden bg-muted">
              <div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 border-t border-border">
            <Stat label="Funded vaults" value={funded.length.toString()} />
            <Stat label="Savers" value={stats.reduce((sum, entry) => sum + (entry.participantCount ?? 0n), 0n).toString()} />
          </dl>
        </section>

        <section className="product-panel p-6 sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="label text-muted-foreground">Current action</div>
              <h2 className="mt-2 text-2xl font-semibold">{round.drawing ? "Complete the encrypted scan" : "Close the active round"}</h2>
            </div>
            <Gavel className="size-5 shrink-0 text-muted-foreground" />
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {round.drawing
              ? "Vault scans are permissionless and batched. Advance any unfinished vault; after the grace period, a stalled vault can be skipped without losing the reserve."
              : "When the timer expires, any connected wallet can close the round and create the encrypted draw target."}
          </p>

          {!round.drawing && (
            <>
              <Button
                size="lg"
                className="mt-7 w-full"
                disabled={!round.closable || !isConnected || busy || wrongNetwork}
                onClick={() => run(actions.closeRound)}
              >
                Close round & draw
              </Button>
              {!round.closable && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {round.totalContribution === 0n
                    ? "At least one vault needs a prize contribution before this round can close."
                    : "This action unlocks when the round countdown reaches zero."}
                </p>
              )}
            </>
          )}

          {round.drawing && (
            <div className="mt-6 divide-y divide-border border-y border-border">
              {funded.map((entry) => (
                <div key={entry.meta.vault} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <TokenIcon symbol={entry.meta.underlyingSymbol} className="size-8 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{entry.meta.symbol}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground tabular">
                        {entry.drawn
                          ? "Scan complete"
                          : entry.drawing
                            ? `${entry.cursor?.toString() ?? "0"} / ${entry.participantCount?.toString() ?? "?"} savers`
                            : "Waiting to begin"}
                      </div>
                    </div>
                  </div>
                  {entry.drawn ? (
                    <span className="status-chip"><Check className="size-3" /> Complete</span>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 sm:flex-none"
                        disabled={!isConnected || busy || wrongNetwork}
                        onClick={() => run(() => actions.advanceVault(entry.meta))}
                      >
                        {entry.drawing ? "Advance batch" : "Begin scan"}
                      </Button>
                      {round.graceOver && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isConnected || busy || wrongNetwork}
                          onClick={() => run(() => actions.skipVault(entry.meta.vault))}
                        >
                          Skip
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <details className="group product-subtle border-b-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div>
            <span className="text-sm font-semibold">Demo sponsor controls</span>
            <span className="ml-3 hidden text-xs text-muted-foreground sm:inline">Simulate vault yield entering the prize pool</span>
          </div>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border p-5">
          <p className="max-w-3xl text-sm text-muted-foreground">
            In production, yield is liquidated into the prize token. This testnet control contributes plaintext USDT so the resulting odds remain verifiable.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-[1fr_.8fr]">
            <AmountField
              id="sponsor-amount"
              label="Contribution"
              value={sponsor}
              onChange={setSponsor}
              unit="USDT"
              presets={[10, 50, 250]}
              disabled={!isConnected || busy || wrongNetwork}
            />
            <div>
              <div className="label text-muted-foreground">Vault</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {VAULTS.map((meta) => (
                  <Button
                    key={meta.vault}
                    size="sm"
                    variant={sponsorVault === meta.vault ? "default" : "outline"}
                    onClick={() => setSponsorVault(meta.vault)}
                  >
                    {meta.symbol}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full"
                disabled={!isConnected || busy || wrongNetwork || round.drawing}
                onClick={() => run(() => actions.contribute(sponsorVault, parseAmount(sponsor)))}
              >
                Contribute {sponsor || "0"} USDT
              </Button>
            </div>
          </div>
        </div>
      </details>

      <details className="group product-subtle mb-12">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <CircleDot className="size-4" />
            <span className="text-sm font-semibold">Protocol details & measured FHE cost</span>
          </div>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-8 border-t border-border p-5 lg:grid-cols-[1.35fr_.65fr]">
          <ol className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
            {ALGORITHM.map((step, index) => (
              <li key={step.title} className="bg-background p-5">
                <div className="font-mono text-xs text-muted-foreground">0{index + 1}</div>
                <h3 className="mt-2 text-sm font-semibold">{step.title}</h3>
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
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              If a vault stalls, anyone can skip it after the one-hour grace period. Its unpaid share rolls over, so one registration cannot block the protocol.
            </p>
          </div>
        </div>
      </details>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border py-4 last:border-r-0 first:pr-4 last:pl-4">
      <dt className="label text-muted-foreground">{label}</dt>
      <dd className="mt-2 font-mono text-lg tabular">{value}</dd>
    </div>
  );
}
