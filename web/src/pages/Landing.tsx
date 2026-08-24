import { ArrowRight, CircleCheck, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { PrizeAmount } from "@/components/PrizeAmount";
import { TokenIcon } from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/contracts";
import { formatCountdown } from "@/hooks/useNow";
import { usePrizeAmount, useRound, useVaultStats, useWrongNetwork } from "@/hooks/usePool";

const PUBLIC = ["Prize reserve", "Round schedule", "Vault odds", "Draw transactions"];
const SEALED = ["Deposit amounts", "Personal odds", "Winning vault", "Winning wallet"];

const STEPS = [
  {
    title: "Choose a vault",
    copy: "Deposit cUSDT, cUSDC, or cWETH. Your principal remains withdrawable and never becomes the prize.",
  },
  {
    title: "Build private odds",
    copy: "Time-weighted balances generate encrypted entries without revealing how much any wallet has saved.",
  },
  {
    title: "Draw across every vault",
    copy: "One public prize is allocated across encrypted vault weights, then privately credited to one saver.",
  },
  {
    title: "Reveal only to yourself",
    copy: "Every saver receives ciphertext. Only the winning wallet can decrypt a non-zero prize balance.",
  },
];

export function Landing() {
  const round = useRound();
  const stats = useVaultStats();
  const prize = usePrizeAmount(round.reserveHandle);
  const wrongNetwork = useWrongNetwork();
  const savers = stats.every((entry) => entry.participantCount !== undefined)
    ? stats.reduce((sum, entry) => sum + entry.participantCount!, 0n)
    : undefined;
  const funded = stats.filter((entry) => (entry.contribution ?? 0n) > 0n);
  const scanned = funded.filter((entry) => entry.drawn).length;

  return (
    <>
      <section className="pb-12 pt-16 text-center sm:pb-16 sm:pt-24 lg:pt-28">
        <div className="mx-auto max-w-5xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-md">
            <LockKeyhole className="size-3.5" /> Private prize savings on Zama FHEVM
          </p>
          <h1 className="mt-7 text-5xl leading-[0.94] font-medium tracking-[-0.065em] sm:text-7xl lg:text-[6rem]">
            Save privately.
            <br />
            Win quietly.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Keep your savings accessible, earn a chance at one shared prize, and leave no public trail of balances, odds, or winners.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button render={<Link to="/vaults" />} size="lg" className="group min-w-44">
              Start saving
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button render={<Link to="/#how-it-works" />} size="lg" variant="outline" className="min-w-44">
              How it works
            </Button>
          </div>
        </div>
      </section>

      <section className="product-panel overflow-hidden">
        <div className="relative min-h-[31rem] overflow-hidden sm:min-h-[38rem] lg:min-h-[43rem]">
          <img
            src="/brand/cachepot-crystal-vault.png"
            alt="A translucent crystal prize vault holding encrypted yellow tokens"
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,248,245,0.05)_35%,rgba(242,242,237,0.92)_100%)] dark:bg-[linear-gradient(180deg,rgba(19,19,18,0.05)_35%,rgba(19,19,18,0.92)_100%)]" />

          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-xl border border-white/75 bg-white/72 px-3 py-2 text-xs font-medium text-neutral-800 shadow-sm backdrop-blur-md sm:left-6 sm:top-6">
            <Sparkles className="size-3.5" /> Encrypted end to end
          </div>

          <div className="absolute inset-x-4 bottom-4 grid gap-3 sm:inset-x-6 sm:bottom-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-lg rounded-2xl border border-white/70 bg-white/74 p-5 text-neutral-900 shadow-[0_20px_45px_-28px_rgb(20_20_18/0.5)] backdrop-blur-xl sm:p-6">
              <p className="flex items-center gap-2 text-sm font-semibold"><CircleCheck className="size-4" /> Your principal stays yours</p>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Yield funds the prize. Withdraw your deposited savings when you need them—without publishing your balance history.
              </p>
            </div>

            <div className="min-w-72 rounded-2xl border border-white/70 bg-white/80 p-5 text-neutral-900 shadow-[0_20px_45px_-28px_rgb(20_20_18/0.5)] backdrop-blur-xl sm:min-w-80 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-neutral-500">Live prize · Round {round.roundId?.toString() ?? "—"}</p>
                  <PrizeAmount amount={prize.data} unavailable={prize.isError || wrongNetwork} className="mt-2 text-4xl sm:text-5xl" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300/80 px-2.5 py-1 text-[11px] font-medium">
                  <span className={`size-1.5 rounded-full ${round.drawing ? "animate-pulse bg-amber-400" : "bg-emerald-500"}`} />
                  {round.drawing ? "Drawing" : "Open"}
                </span>
              </div>
              <Link to="/prize" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
                Inspect this draw <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Live protocol statistics" className="grid border-b border-border/70 py-9 sm:grid-cols-3 sm:py-11">
        <Evidence label="Private savers" value={savers?.toString()} />
        <Evidence label="Live vaults" value={stats.length.toString()} />
        <Evidence
          label={round.drawing ? "Vaults scanned" : "Next draw closes in"}
          value={round.drawing ? `${scanned}/${funded.length}` : round.secondsLeft !== undefined ? formatCountdown(round.secondsLeft) : undefined}
        />
      </section>

      <section id="how-it-works" className="scroll-mt-28 py-20 sm:py-24 lg:grid lg:grid-cols-[.78fr_1.22fr] lg:gap-20">
        <div>
          <p className="text-sm text-muted-foreground">How it works</p>
          <h2 className="mt-4 max-w-md text-4xl leading-[1.02] font-medium tracking-[-0.045em] sm:text-5xl">
            A prize account that keeps its own counsel.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            CachePot separates what the protocol must prove from what the public needs to know. The draw stays auditable while saver data stays encrypted.
          </p>
          <Button render={<Link to="/vaults" />} variant="outline" size="lg" className="mt-7">
            Explore vaults <ArrowRight className="size-4" />
          </Button>
        </div>

        <ol className="mt-12 border-t border-border lg:mt-0">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid gap-4 border-b border-border py-6 sm:grid-cols-[4rem_1fr] sm:gap-7 sm:py-7">
              <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              <div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-10 sm:py-14">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Live protocol</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Save what you already hold.</h2>
          </div>
          <Link to="/vaults" className="inline-flex items-center gap-2 text-sm font-medium hover:underline">
            Compare all vaults <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="product-panel mt-8 overflow-hidden">
          <div className="divide-y divide-border/70">
            {stats.map((entry) => {
              const share = entry.contribution !== undefined && round.totalContribution
                ? Number((entry.contribution * 1000n) / round.totalContribution) / 10
                : undefined;
              return (
                <Link
                  key={entry.meta.vault}
                  to={`/vault/${entry.meta.vault}`}
                  className="group grid gap-4 p-5 transition-colors hover:bg-white/45 sm:grid-cols-[1fr_.7fr_.85fr_.7fr_auto] sm:items-center sm:px-6"
                >
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={entry.meta.underlyingSymbol} className="size-10 shrink-0" />
                    <div><div className="font-semibold">{entry.meta.underlyingSymbol}</div><div className="text-xs text-muted-foreground">{entry.meta.symbol} receipt</div></div>
                  </div>
                  <Metric label="Savers" value={entry.participantCount?.toString() ?? "—"} />
                  <Metric label="Prize input" value={entry.contribution !== undefined ? `${formatAmount(entry.contribution)} cUSDT` : "—"} />
                  <Metric label="Draw odds" value={share !== undefined ? `${share}%` : "—"} />
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 py-16 lg:grid-cols-[.9fr_1.1fr] lg:py-24">
        <div className="flex flex-col justify-between rounded-[var(--radius-panel)] bg-foreground p-7 text-background sm:p-10">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-background/65"><ShieldCheck className="size-4" /> Explicit privacy boundary</div>
            <h2 className="mt-6 max-w-md text-4xl leading-[1.02] font-medium tracking-[-0.045em] sm:text-5xl">Verify the protocol, not the saver.</h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-background/65 sm:text-base">
              Enough state remains public to audit each round. Personal financial state stays ciphertext from deposit to prize claim.
            </p>
          </div>
          <Link to="/prize" className="mt-10 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
            Inspect the live draw <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PrivacyCard icon={<Eye className="size-4" />} title="Public by design" items={PUBLIC} />
          <PrivacyCard icon={<EyeOff className="size-4" />} title="Always encrypted" items={SEALED} sealed />
        </div>
      </section>

      <section className="product-panel mb-16 overflow-hidden p-7 text-center sm:p-12 lg:p-16">
        <p className="text-sm text-muted-foreground">Start with the asset already in your wallet</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-4xl leading-[1.02] font-medium tracking-[-0.045em] sm:text-5xl">
          Your balance can stay private.<br className="hidden sm:block" /> Your chance does not have to.
        </h2>
        <Button render={<Link to="/vaults" />} size="lg" className="group mt-8 min-w-48">
          Choose a vault
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </section>
    </>
  );
}

function Evidence({ label, value }: { label: string; value?: string }) {
  return (
    <div className="border-t border-border/70 py-5 first:border-t-0 sm:border-l sm:border-t-0 sm:px-7 sm:py-0 sm:first:border-l-0 sm:first:pl-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-medium tabular">{value ?? "—"}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground sm:hidden">{label}</div><div className="mt-1 text-sm tabular sm:mt-0">{value}</div></div>;
}

function PrivacyCard({ icon, title, items, sealed = false }: { icon: React.ReactNode; title: string; items: string[]; sealed?: boolean }) {
  return (
    <article className="product-subtle p-6 sm:p-8">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <ul className="mt-8 space-y-5">
        {items.map((item) => <li key={item} className="flex items-center gap-3 text-sm text-muted-foreground"><span className={`size-1.5 rounded-full ${sealed ? "bg-primary" : "bg-muted-foreground"}`} />{item}</li>)}
      </ul>
    </article>
  );
}
