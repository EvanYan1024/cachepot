import { useState } from "react";
import { Check, Gavel, Sparkles } from "lucide-react";
import { useAccount } from "wagmi";
import { AmountField } from "@/components/AmountField";
import { PageHead } from "@/components/Layout";
import { PrizeAmount } from "@/components/PrizeAmount";
import { Button } from "@/components/ui/button";
import { VAULTS, parseAmount } from "@/lib/contracts";
import { formatCountdown } from "@/hooks/useNow";
import { usePoolActions, usePrizeAmount, useRound, useVaultStats, useWrongNetwork } from "@/hooks/usePool";
import { useTx } from "@/hooks/useTx";

const ALGORITHM = [
  {
    title: "Sample randomness nobody can predict",
    code: "rand = FHE.randEuint64()",
    body: "The protocol's CSPRNG returns a ciphertext. The proposer, the operator and the caller all see the same opaque handle — there is no seed to grind and no oracle round trip to front-run.",
  },
  {
    title: "Pick the winning vault — in ciphertext",
    code: "vaultHit = (target ≥ cumStart) ∧ (target < cumEnd)",
    body: "Each vault's odds interval comes from its plaintext contribution, so anyone can audit the math. But the comparison against the encrypted target yields an encrypted boolean: no observer learns which vault won.",
  },
  {
    title: "Scan encrypted weights inside each vault",
    code: "cum += weight[i];  hit = FHE.lt(target, cum)",
    body: "A homomorphic prefix sum walks each vault's savers. Each comparison yields an encrypted boolean — the contract itself cannot branch on it, which is exactly why nothing leaks.",
  },
  {
    title: "Credit everyone, pay one",
    code: "prize[u] += FHE.select(local ∧ vaultHit ∧ ¬awarded, reserve, 0)",
    body: "Every saver of every vault gets a prize credit each round. All but one is an encrypted zero, and an encrypted flag caps the protocol at one payout — even a lying vault cannot drain the reserve.",
  },
];

const HCU = [
  { step: "closeRound", global: "2.7 M", note: "randomness + plaintext odds intervals" },
  { step: "advanceDraw, per saver", global: "2.55 M", note: "TWAB settle + compare + credit" },
  { step: "advanceDraw, batch of 6", global: "≈ 15.3 M", note: "under the 20 M per-transaction ceiling" },
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

  return (
    <>
      <PageHead
        eyebrow={round.roundId !== undefined ? `Round ${round.roundId}` : "Round"}
        title="The prize is public. The winner is not."
        lede="Closing a round and advancing each vault's scan are permissionless — anyone can pay the gas. What no one can do, at any price, is find out which vault the prize landed in, let alone who took it."
        aside={
          <div
            className={`label inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 ${
              round.drawing ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            <span className={`size-1.5 rounded-full ${round.drawing ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
            {round.state === undefined ? "Loading" : round.drawing ? "Drawing" : "Open"}
          </div>
        }
      />

      <section className="my-8 grid overflow-hidden rounded-sm border border-border bg-card sm:grid-cols-3">
        {[
          { n: "01", label: "Accrue", detail: round.drawing ? "Ledger closed" : "TWAB window open", active: !round.drawing },
          { n: "02", label: "Scan", detail: round.drawing ? `${finished}/${funded.length} vaults` : "Encrypted target", active: round.drawing },
          { n: "03", label: "Credit", detail: "Winner remains sealed", active: false },
        ].map((phase) => (
          <div key={phase.n} className={`flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0 ${phase.active ? "bg-primary text-primary-foreground" : ""}`}>
            <span className={`numeral text-3xl ${phase.active ? "text-primary-foreground/70" : "text-primary/55"}`}>{phase.n}</span>
            <div>
              <div className="label">{phase.label}</div>
              <div className={`mt-1 font-mono text-xs ${phase.active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{phase.detail}</div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-12 py-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="rise space-y-10">
          <section className="ledger-sheet">
            <div className="p-7 pl-12 sm:pl-16">
              <div className="flex items-start justify-between gap-4">
                <div>
              <div className="label text-muted-foreground">Prize reserve</div>
              <PrizeAmount
                amount={prize.data}
                unavailable={prize.isError || wrongNetwork}
                className="mt-2 text-6xl sm:text-7xl"
              />
                </div>
                <span className="seal-stamp size-16 shrink-0">Public<br />Value</span>
              </div>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                Stored encrypted, but marked publicly decryptable on-chain — the reserve is the single value the
                protocol deliberately reveals, so savers can see what they are playing for. If a round pays nobody, it
                rolls over intact.
              </p>

              <div className="mt-8 space-y-2 border-t border-border pt-6">
                <div className="flex items-baseline justify-between">
                  <span className="label text-muted-foreground">{round.drawing ? "Draw progress" : "Round progress"}</span>
                  <span className="font-mono text-sm tabular">
                    {round.drawing
                      ? `${finished} / ${funded.length} vaults scanned`
                      : round.secondsLeft === undefined
                        ? "—"
                        : round.secondsLeft > 0
                          ? `${formatCountdown(round.secondsLeft)} left`
                          : "ready to close"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700"
                    style={{ width: `${round.drawing ? drawPct : elapsedPct}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="border-l-2 border-primary pl-6 sm:pl-7">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="label text-primary">Permissionless</div>
                <h2 className="mt-2 text-2xl font-semibold">Run the draw yourself</h2>
              </div>
              <Gavel className="size-5 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              The draw is a state machine, batched because homomorphic work is metered per transaction. Close the round,
              then scan each funded vault to completion — or let anyone else (including our keeper) finish it.
            </p>

            <Button
              size="lg"
              className="mt-6 w-full"
              disabled={!round.closable || busy || wrongNetwork}
              onClick={() => run(actions.closeRound)}
            >
              Close round & draw
            </Button>

            {round.drawing && (
              <ul className="mt-5 space-y-px bg-border">
                {funded.map((entry) => (
                  <li key={entry.meta.vault} className="flex items-center gap-4 bg-background py-3">
                    <span className="w-16 font-mono text-sm">{entry.meta.symbol}</span>
                    <span className="flex-1 font-mono text-xs text-muted-foreground tabular">
                      {entry.drawn
                        ? "scanned"
                        : entry.drawing
                          ? `${entry.cursor?.toString() ?? "0"} / ${entry.participantCount?.toString() ?? "?"} savers`
                          : "waiting"}
                    </span>
                    {entry.drawn ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy || wrongNetwork}
                          onClick={() => run(() => actions.advanceVault(entry.meta))}
                        >
                          {entry.drawing ? "Advance batch" : "Begin scan"}
                        </Button>
                        {round.graceOver && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || wrongNetwork}
                            onClick={() => run(() => actions.skipVault(entry.meta.vault))}
                          >
                            Skip
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!round.closable && !round.drawing && (
              <p className="mt-4 text-xs text-muted-foreground">
                {round.totalContribution === 0n
                  ? "The round cannot close until at least one vault has a contribution."
                  : "The round closes when the countdown reaches zero."}
              </p>
            )}
          </section>

          <section className="ledger-inset border-dashed p-7">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="label text-primary">Sponsor</div>
                <h2 className="mt-2 text-2xl font-semibold">Buy a vault its odds</h2>
              </div>
              <Sparkles className="size-5 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              A demo stand-in for the yield source: in production each vault's earnings are liquidated into the prize
              token and contributed here. The amount is deliberately plaintext — it is what makes the odds verifiable —
              and the pool wraps it into confidential cUSDT itself.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
              <AmountField
                id="sponsor-amount"
                label="Contribution (USDT)"
                value={sponsor}
                onChange={setSponsor}
                presets={[10, 50, 250]}
                disabled={!isConnected || busy || wrongNetwork}
              />
              <div>
                <div className="label text-muted-foreground">For vault</div>
                <div className="mt-2 flex gap-1.5">
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
              </div>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="mt-6 w-full"
              disabled={!isConnected || busy || wrongNetwork || round.drawing}
              onClick={() => run(() => actions.contribute(sponsorVault, parseAmount(sponsor)))}
            >
              Contribute {sponsor || "0"} USDT for {VAULTS.find((meta) => meta.vault === sponsorVault)?.symbol}
            </Button>
            {round.drawing && (
              <p className="mt-3 text-xs text-muted-foreground">Contributions reopen when the draw settles.</p>
            )}
          </section>
        </div>

        <aside className="rise space-y-8" style={{ animationDelay: "120ms" }}>
          <section className="ledger-sheet p-6 pl-12 sm:pl-16">
            <div className="label text-primary">The draw, step by step</div>
            <ol className="mt-5">
              {ALGORITHM.map((step, index) => (
                <li key={step.title} className="border-t border-border py-6 first:border-t-0 first:pt-0">
                  <div className="flex items-baseline gap-3">
                    <span className="numeral text-2xl text-primary/70">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                  </div>
                  <code className="mt-3 block overflow-x-auto border-l-2 border-primary bg-background/70 px-3 py-2 font-mono text-xs">
                    {step.code}
                  </code>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="ledger-inset p-6">
            <div className="label text-muted-foreground">Measured cost</div>
            <p className="mt-2 text-sm text-muted-foreground">
              HCU is the FHEVM's meter for homomorphic work — gas for ciphertext. These are measured, not estimated,
              and they are why each vault's scan is batched at six.
            </p>
            <table className="mt-5 w-full text-sm">
              <tbody>
                {HCU.map((row) => (
                  <tr key={row.step} className="border-t border-border">
                    <td className="py-3 pr-3 align-top">
                      <div>{row.step}</div>
                      <div className="text-xs text-muted-foreground">{row.note}</div>
                    </td>
                    <td className="py-3 text-right align-top font-mono tabular whitespace-nowrap">{row.global}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="border-t border-border pt-6">
            <div className="label text-muted-foreground">Liveness</div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A vault that never finishes its scan — a junk registration, or one with no savers — can be skipped by
              anyone after a one-hour grace period. Its unclaimed odds simply roll the prize into the next round, so no
              single vault can hold the protocol hostage.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
