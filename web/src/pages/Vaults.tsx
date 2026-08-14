import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHead } from "@/components/Layout";
import { Veil } from "@/components/Veil";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/contracts";
import { usePosition, useRound, useVaultStats } from "@/hooks/usePool";

export function Vaults() {
  const round = useRound();
  const stats = useVaultStats();
  const position = usePosition();

  const odds = (contribution: bigint | undefined) =>
    contribution === undefined || !round.totalContribution
      ? undefined
      : Number((contribution * 1000n) / round.totalContribution) / 10;

  return (
    <>
      <PageHead
        eyebrow="Vaults"
        title="One shared prize. Many doors in."
        lede="Each vault holds one confidential asset and keeps its own encrypted ledger. Contributions of the prize token buy a vault's share of the odds — that share is public math, exactly as in PoolTogether. Which vault the prize lands in stays encrypted."
      />

      <div className="grid gap-6 py-12 md:grid-cols-3">
        {stats.map(({ meta, contribution, participantCount, drawing, cursor }, index) => {
          const myPosition = position.positions.find((entry) => entry.meta.vault === meta.vault);
          const share = odds(contribution);
          return (
            <div
              key={meta.vault}
              className="rise flex flex-col rounded-lg border border-border bg-card p-7"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold">{meta.symbol}</h2>
                {drawing ? (
                  <span className="label inline-flex items-center gap-1.5 rounded-full border border-primary px-2.5 py-1 text-primary">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    Scanning {cursor?.toString() ?? "0"}/{participantCount?.toString() ?? "?"}
                  </span>
                ) : (
                  <span className="label text-muted-foreground">{meta.underlyingSymbol} savings</span>
                )}
              </div>

              <dl className="mt-6 space-y-4 border-t border-border pt-5 text-sm">
                <div className="flex items-baseline justify-between">
                  <dt className="label text-muted-foreground">Savers</dt>
                  <dd className="font-mono tabular">{participantCount?.toString() ?? "—"}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="label text-muted-foreground">Round contribution</dt>
                  <dd className="font-mono tabular">
                    {contribution !== undefined ? `${formatAmount(contribution)} cUSDT` : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="label text-muted-foreground">Odds this round</dt>
                  <dd className="font-mono tabular">{share !== undefined ? `${share}%` : "—"}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="label text-muted-foreground">Your deposit</dt>
                  <dd className="font-mono tabular">
                    {!position.hasPermit ? (
                      <span className="hatch veil-drift inline-block h-4 w-16 rounded-xs border border-border align-middle" />
                    ) : (
                      <Veil
                        sealed={false}
                        loading={myPosition?.balance === undefined}
                        handle={myPosition?.balanceHandle}
                        className="h-4 w-16"
                      >
                        {myPosition?.balance !== undefined ? formatAmount(myPosition.balance) : "0"} {meta.symbol}
                      </Veil>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${share ?? 0}%` }} />
              </div>

              <Button render={<Link to={`/vault/${meta.vault}`} />} className="group mt-7 w-full">
                Open {meta.symbol} vault
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-8 border-t border-border py-12 md:grid-cols-2">
        <section>
          <div className="label text-primary">Two-level draw</div>
          <h3 className="mt-2 text-xl font-semibold">Odds are public. The winning vault is not.</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Level one picks the winning vault by its plaintext contribution — anyone can check the math. Level two scans
            that vault's encrypted time-weighted balances. But unlike PoolTogether, the level-one result is itself a
            ciphertext: every saver of every vault is credited each round, and all but one credit is an encrypted zero.
          </p>
        </section>
        <section>
          <div className="label text-muted-foreground">A curated directory</div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Vault registration on-chain is permissionless — a vault's odds are bounded by what it contributes, so
            registering buys nothing by itself. This page lists the vaults this interface trusts; anyone can build
            another interface over the same pool, or register a vault of their own.
          </p>
        </section>
      </div>
    </>
  );
}
