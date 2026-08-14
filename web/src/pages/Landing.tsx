import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { PotMark } from "@/components/PotMark";
import { PrizeAmount } from "@/components/PrizeAmount";
import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/hooks/useNow";
import { usePrizeAmount, useRound, useVaultStats, useWrongNetwork } from "@/hooks/usePool";

const PUBLIC = [
  "The prize reserve and the schedule",
  "Each vault's contribution — odds are auditable math",
  "The encrypted randomness commitment",
  "Every draw transaction and its gas",
  "The number of savers per vault",
];

const SEALED = [
  "How much you deposited",
  "How much anyone else deposited",
  "Your odds relative to others",
  "Which vault the prize landed in",
  "Which address won the round",
];

const STEPS = [
  {
    n: "01",
    title: "Deposit, encrypted",
    body: "Your amount is encrypted in the browser and proved with a zero-knowledge input proof. The chain stores a ciphertext handle — never a number.",
  },
  {
    n: "02",
    title: "Earn weight over time",
    body: "An encrypted time-weighted average balance decides your odds. Money that arrived one block before the draw carries almost no weight.",
  },
  {
    n: "03",
    title: "The pot draws itself",
    body: "Anyone can close the round. The contract samples randomness that even validators cannot predict, then scans encrypted weights homomorphically.",
  },
  {
    n: "04",
    title: "One winner, unannounced",
    body: "Every saver of every vault is credited each round — all but one credit is an encrypted zero. The anonymity set is the whole protocol, and only the winner's own wallet can tell.",
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
      <section className="relative grid gap-12 py-14 md:grid-cols-[1.12fr_.88fr] md:items-center md:py-24">
        <PotMark className="pointer-events-none absolute -top-10 -left-24 -z-10 size-[26rem] rotate-12 text-primary/[0.055] md:-left-40 md:size-[34rem]" />

        <div className="rise">
          <div className="folio-rule max-w-sm text-primary">
            Record 001 · Zama FHEVM
          </div>
          <h1 className="mt-6 text-[2.75rem] leading-[1.02] font-semibold sm:text-6xl">
            Anyone can audit the draw.
            <br />
            <span className="text-primary">Nobody</span> can read the ledger.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            CachePot is a prize-savings protocol where every balance lives on-chain as ciphertext. Save in the vault of
            your choice — USDT, USDC or WETH — and keep your principal withdrawable at any time. Each round hands one
            shared prize to one saver, and not even the operator learns which vault it landed in.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button render={<Link to="/vaults" />} size="lg" className="group">
              Start saving
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button render={<Link to="/prize" />} size="lg" variant="outline">
              Inspect this round
            </Button>
          </div>
        </div>

        <div className="ledger-sheet rise" style={{ animationDelay: "120ms" }}>
          <div className="flex items-start justify-between gap-5 border-b border-border bg-secondary/55 px-7 py-5 pl-14 sm:pl-16">
            <div>
              <div className="label text-muted-foreground">Public prize ledger</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">ROUND / {round.roundId?.toString() ?? "—"}</div>
            </div>
            <span className="seal-stamp size-16 shrink-0">Public<br />Audit</span>
          </div>
          <div className="px-7 py-8 pl-14 sm:pl-16">
            <div className="label text-muted-foreground">Prize reserve · disclosed value</div>
            <PrizeAmount
              amount={prize.data}
              unavailable={prize.isError || wrongNetwork}
              className="mt-2 text-6xl sm:text-7xl"
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Publicly decryptable by design — the pot is the one number everyone is allowed to see.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6">
              <Figure label="Round" value={round.roundId?.toString()} />
              <Figure
                label={round.drawing ? "Drawing" : "Closes in"}
                value={
                  round.drawing
                    ? `${scanned}/${funded.length} vaults`
                    : round.secondsLeft !== undefined
                      ? formatCountdown(round.secondsLeft)
                      : undefined
                }
              />
              <Figure label="Savers" value={savers?.toString()} />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border py-16">
        <h2 className="max-w-lg text-3xl font-semibold sm:text-4xl">The confidentiality boundary, drawn explicitly.</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          A confidential dApp is only credible if it says exactly what leaks. Here is ours.
        </p>

        <div className="ledger-sheet mt-10 grid md:grid-cols-2">
          <Column
            icon={<Eye className="size-4" />}
            title="Public on-chain"
            note="Verifiable by anyone with an RPC endpoint"
            items={PUBLIC}
            tone="plain"
          />
          <Column
            icon={<EyeOff className="size-4" />}
            title="Encrypted forever"
            note="Never decryptable without the owner's own signature"
            items={SEALED}
            tone="sealed"
          />
        </div>
      </section>

      <section className="border-t border-border py-16">
        <div className="label text-primary">Mechanics</div>
        <h2 className="mt-3 max-w-lg text-3xl font-semibold sm:text-4xl">Four steps, none of which reveal you.</h2>
        <ol className="ledger-sheet mt-10">
          {STEPS.map((step) => (
            <li key={step.n} className="ledger-row gap-5 px-6 py-7 pl-11 sm:grid-cols-[4rem_.65fr_1.35fr] sm:items-baseline sm:pl-16 md:px-8 md:pl-20">
              <div className="numeral text-4xl text-primary/70">{step.n}</div>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border py-16">
        <div className="grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-center">
          <div>
            <div className="label text-primary">Under the hood</div>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">A lottery that never decrypts anything.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              The winner is picked by a homomorphic prefix-sum scan over encrypted weights. There is no reveal step, no
              trusted operator, and no oracle callback that could leak an intermediate value. The draw is batched
              because FHE work is metered — we measured it.
            </p>
            <Button render={<Link to="/prize" />} variant="outline" size="lg" className="mt-6">
              Read the draw algorithm
            </Button>
          </div>
          <pre className="ledger-inset overflow-x-auto border-l-4 border-l-primary p-6 font-mono text-[13px] leading-relaxed">
            <code>
              <span className="text-muted-foreground">{"// one round, entirely in ciphertext"}</span>
              {"\n"}rand     = FHE.randEuint64();{"\n"}
              vaultHit = (target {"≥"} cumStart) {"∧"} (target {"<"} cumEnd);{"\n"}
              {"\n"}
              <span className="text-muted-foreground">{"// each vault, scanned in batches of 6"}</span>
              {"\n"}cum    = FHE.add(cum, weight[i]);{"\n"}
              hit    = FHE.lt(target, cum);{"\n"}
              win    = FHE.and(local[i], vaultHit);{"\n"}
              pri[i] = FHE.add(pri[i], <span className="text-primary">FHE.select(win, prize, 0)</span>);
            </code>
          </pre>
        </div>
      </section>

      <section className="border-t border-border py-16">
        <div className="ledger-sheet flex flex-col items-start gap-6 p-8 pl-12 sm:flex-row sm:items-center sm:justify-between sm:p-10 sm:pl-16">
          <div>
            <h2 className="text-3xl font-semibold">Put something in the pot.</h2>
            <p className="mt-2 text-muted-foreground">Test tokens are one click away. Withdraw whenever you like.</p>
          </div>
          <Button render={<Link to="/vaults" />} size="lg" className="group shrink-0">
            Open the pot
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </section>
    </>
  );
}

function Figure({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="label text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-mono text-lg tabular">{value ?? "—"}</div>
    </div>
  );
}

function Column({
  icon,
  title,
  note,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  items: string[];
  tone: "plain" | "sealed";
}) {
  return (
    <div className="border-b border-border bg-card/55 p-7 pl-12 last:border-b-0 md:border-r md:border-b-0 md:pl-16 md:last:border-r-0">
      <div className="flex items-center gap-2">
        <span className={tone === "sealed" ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      <div className="label mt-1.5 text-muted-foreground">{note}</div>
      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm">
            {tone === "sealed" ? (
              <span className="hatch veil-drift mt-1 h-3.5 w-8 shrink-0 rounded-xs border border-border" />
            ) : (
              <span className="mt-2 h-px w-8 shrink-0 bg-foreground/40" />
            )}
            <span className={tone === "sealed" ? "text-foreground" : "text-muted-foreground"}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
