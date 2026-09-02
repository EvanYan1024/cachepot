import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHead } from "@/components/Layout";
import { TokenIcon } from "@/components/TokenIcon";
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
        eyebrow="Save"
        title="Choose a confidential vault"
        lede="Your balance stays encrypted. Each vault contributes public yield to one shared prize, so its share of the draw remains independently auditable."
        aside={
          <span className="status-chip self-start">
            <span className="size-1.5 rounded-full bg-primary" />
            {stats.length} assets live
          </span>
        }
      />

      <section className="product-panel my-8 overflow-hidden">
        <div className="hidden grid-cols-[1.2fr_.55fr_.8fr_.65fr_1fr_8rem] gap-6 border-b border-border/70 bg-secondary/55 px-6 py-3.5 lg:grid">
          {[
            "Asset",
            "Savers",
            "Prize input",
            "Draw odds",
            "Your position",
            "",
          ].map((label, index) => (
            <div key={`${label}-${index}`} className="label text-muted-foreground">
              {label}
            </div>
          ))}
        </div>

          <div className="divide-y divide-border/70">
          {stats.map(({ meta, contribution, participantCount, drawing, cursor }, index) => {
            const myPosition = position.positions.find((entry) => entry.meta.vault === meta.vault);
            const share = odds(contribution);

            return (
              <article
                key={meta.vault}
                className="rise grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1.2fr_.55fr_.8fr_.65fr_1fr_8rem] lg:items-center"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="flex items-center gap-4">
                  <TokenIcon symbol={meta.underlyingSymbol} className="size-11 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold">{meta.underlyingSymbol}</h2>
                      {meta.earn && <span className="status-chip">Earn</span>}
                      {drawing && (
                        <span className="status-chip border-primary/50 bg-primary/15 text-foreground">Scanning</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Private {meta.symbol} receipt</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:contents">
                  <Metric label="Savers" value={participantCount?.toString() ?? "—"} />
                  <Metric
                    label="Prize input"
                    value={contribution !== undefined ? `${formatAmount(contribution)} cUSDT` : "—"}
                  />
                </div>

                <div>
                  <div className="label mb-2 text-muted-foreground lg:hidden">Draw odds</div>
                  <div className="flex items-center gap-3">
                    <span className="w-12 font-mono text-sm tabular">{share !== undefined ? `${share}%` : "—"}</span>
                    <div className="h-1.5 flex-1 overflow-hidden bg-muted">
                      <div
                        className="h-full bg-primary transition-[width] duration-700"
                        style={{ width: `${share ?? 0}%` }}
                      />
                    </div>
                  </div>
                  {drawing && (
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      batch {cursor?.toString() ?? "0"}/{participantCount?.toString() ?? "?"}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-[1fr_auto] items-end gap-4 lg:contents">
                  <div>
                    <div className="label mb-2 text-muted-foreground lg:hidden">Your position</div>
                    <Veil
                      sealed={!position.hasPermit}
                      loading={position.hasPermit && myPosition?.balance === undefined && !myPosition?.balanceFailed}
                      failed={myPosition?.balanceFailed}
                      handle={myPosition?.balanceHandle}
                      className="font-mono text-sm tabular"
                    >
                      <span className="font-mono text-sm tabular">
                        {myPosition?.balance !== undefined ? formatAmount(myPosition.balance) : "0"} {meta.symbol}
                      </span>
                    </Veil>
                  </div>

                  <Button render={<Link to={`/vault/${meta.vault}`} />} variant="outline" className="group lg:w-auto lg:justify-self-end">
                    Manage
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 pb-12 md:grid-cols-2">
        <section className="product-subtle flex gap-4 p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Public odds, private outcome</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Contributions define each vault's public odds. The selected vault and winning saver remain ciphertext.
            </p>
          </div>
        </section>
        <section className="product-subtle flex gap-4 p-5">
          <LockKeyhole className="mt-0.5 size-5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold">Curated interface, open protocol</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              This interface lists reviewed vaults. Registration on-chain remains permissionless and cannot increase odds without contribution.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label mb-2 text-muted-foreground lg:hidden">{label}</div>
      <div className="font-mono text-sm tabular">{value}</div>
    </div>
  );
}
