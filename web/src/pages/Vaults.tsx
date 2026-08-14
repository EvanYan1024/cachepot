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
        eyebrow="Vault registry"
        title="One shared prize. Many doors in."
        lede="Each vault holds one confidential asset and keeps its own encrypted ledger. Contributions of the prize token buy a vault's share of the odds — that share is public math, exactly as in PoolTogether. Which vault the prize lands in stays encrypted."
      />

      <section className="ledger-sheet my-12">
        <div className="grid gap-4 border-b border-border bg-secondary/70 px-6 py-4 pl-11 sm:pl-16 md:grid-cols-[1.1fr_.55fr_.9fr_.65fr_auto] md:px-8 md:pl-20">
          <div className="label text-muted-foreground">Registered confidential vault</div>
          <div className="label hidden text-muted-foreground md:block">Savers</div>
          <div className="label hidden text-muted-foreground md:block">Contribution</div>
          <div className="label hidden text-muted-foreground md:block">Odds</div>
          <div className="label hidden text-muted-foreground md:block">Access</div>
        </div>
        {stats.map(({ meta, contribution, participantCount, drawing, cursor }, index) => {
          const myPosition = position.positions.find((entry) => entry.meta.vault === meta.vault);
          const share = odds(contribution);
          return (
            <article
              key={meta.vault}
              className="ledger-row rise gap-6 px-6 py-7 pl-11 sm:pl-16 md:grid-cols-[1.1fr_.55fr_.9fr_.65fr_auto] md:items-center md:px-8 md:pl-20"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="flex items-start gap-4">
                <span className="ledger-number mt-1">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2 className="font-display text-2xl font-semibold">{meta.symbol}</h2>
                  <div className="label mt-1.5 text-muted-foreground">{meta.underlyingSymbol} savings ledger</div>
                  <div className="mt-3 font-mono text-xs text-muted-foreground md:hidden">
                    {participantCount?.toString() ?? "—"} savers · {share !== undefined ? `${share}% odds` : "odds pending"}
                  </div>
                </div>
              </div>
              <div className="hidden font-mono text-sm tabular md:block">{participantCount?.toString() ?? "—"}</div>
              <div className="hidden font-mono text-sm tabular md:block">
                {contribution !== undefined ? `${formatAmount(contribution)} cUSDT` : "—"}
              </div>
              <div className="hidden md:block">
                <div className="font-mono text-sm tabular">{share !== undefined ? `${share}%` : "—"}</div>
                <div className="mt-2 h-1 w-full overflow-hidden bg-muted">
                  <div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${share ?? 0}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 md:justify-end">
                <div className="md:hidden">
                  <div className="label text-muted-foreground">Your sealed deposit</div>
                  <div className="mt-1 font-mono text-sm">
                    {!position.hasPermit ? (
                      <span className="hatch veil-drift inline-block h-4 w-20 rounded-xs border border-border align-middle" />
                    ) : (
                      <Veil sealed={false} loading={myPosition?.balance === undefined} handle={myPosition?.balanceHandle} className="h-4 w-20">
                        {myPosition?.balance !== undefined ? formatAmount(myPosition.balance) : "0"} {meta.symbol}
                      </Veil>
                    )}
                  </div>
                </div>
                {drawing && (
                  <span className="seal-stamp hidden size-14 shrink-0 md:inline-grid">
                    Scan<br />{cursor?.toString() ?? "0"}/{participantCount?.toString() ?? "?"}
                  </span>
                )}
                <Button render={<Link to={`/vault/${meta.vault}`} />} variant="outline" className="group shrink-0">
                  Open
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </article>
          );
        })}
      </section>

      <div className="grid gap-8 border-t border-border py-12 md:grid-cols-[1.2fr_.8fr]">
        <section className="border-l-2 border-primary pl-6">
          <div className="label text-primary">Two-level draw</div>
          <h3 className="mt-2 text-xl font-semibold">Odds are public. The winning vault is not.</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Level one picks the winning vault by its plaintext contribution — anyone can check the math. Level two scans
            that vault's encrypted time-weighted balances. But unlike PoolTogether, the level-one result is itself a
            ciphertext: every saver of every vault is credited each round, and all but one credit is an encrypted zero.
          </p>
        </section>
        <section className="ledger-inset p-6">
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
