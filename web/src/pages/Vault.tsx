import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Coins, Fingerprint, Lock, ShieldCheck, Sprout } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { AmountField } from "@/components/AmountField";
import { PageHead } from "@/components/Layout";
import { Veil } from "@/components/Veil";
import { Button } from "@/components/ui/button";
import { findVault, formatAmount, formatAmountPlain, parseAmount, type VaultMeta } from "@/lib/contracts";
import { useEarnStats, usePosition, useVaultActions, useWrongNetwork } from "@/hooks/usePool";
import { useTx } from "@/hooks/useTx";

export function Vault() {
  const { address: vaultAddress } = useParams();
  const meta = findVault(vaultAddress);
  if (!meta) return <Navigate to="/vaults" replace />;
  return <VaultDetail meta={meta} />;
}

function VaultDetail({ meta }: { meta: NonNullable<ReturnType<typeof findVault>> }) {
  const { isConnected } = useAccount();
  const actions = useVaultActions(meta);
  const position = usePosition();
  const { busy, run } = useTx();
  const wrongNetwork = useWrongNetwork();
  const [depositAmount, setDepositAmount] = useState("100");
  const [withdrawAmount, setWithdrawAmount] = useState("50");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

  const mine = position.positions.find((entry) => entry.meta.vault === meta.vault);
  const disabled = !isConnected || busy || wrongNetwork;
  const amount = mode === "deposit" ? depositAmount : withdrawAmount;
  const setAmount = mode === "deposit" ? setDepositAmount : setWithdrawAmount;
  const available = mode === "deposit" ? mine?.walletBalance : mine?.balance;
  const availableHandle = mode === "deposit" ? mine?.walletBalanceHandle : mine?.balanceHandle;

  const trace = [
    "Encrypt the amount and produce an input proof in this tab",
    `${mode === "deposit" ? `${meta.symbol}.confidentialTransferFrom` : "vault.withdraw"} submits a ciphertext`,
    "The vault updates its encrypted balance and time-weighted position",
    "The interface refreshes the private balance after confirmation",
  ];

  return (
    <>
      <PageHead
        eyebrow={`${meta.underlyingSymbol} savings · Confidential vault`}
        title={`${meta.symbol} vault`}
        lede={`Save ${meta.symbol} without publishing your balance. Principal stays withdrawable at any time; prize credits settle separately in cUSDT.`}
        aside={
          <Button render={<Link to="/vaults" />} variant="ghost" className="self-start">
            <ArrowLeft className="size-4" />
            All vaults
          </Button>
        }
      />

      <div className="grid gap-6 pb-12 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,.75fr)] lg:items-start">
        <section className="product-panel overflow-hidden lg:col-start-2 lg:row-start-1">
          <div className="border-b border-border/70 p-5">
            <div className="text-xs font-medium text-muted-foreground">Private position</div>
            <h2 className="mt-1 text-lg font-medium">Your {meta.symbol} balance</h2>
          </div>
          <BalanceCell label="Private wallet" value={mine?.walletBalance} handle={mine?.walletBalanceHandle} symbol={meta.symbol} permit={position.hasPermit} />
          <BalanceCell label="Saved in vault" value={mine?.balance} handle={mine?.balanceHandle} symbol={meta.symbol} permit={position.hasPermit} />
          <div className="flex min-h-24 items-center gap-4 border-t border-border/70 p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_18px_rgb(255_217_26/0.2)]">
              <Fingerprint className="size-5" strokeWidth={1.7} />
            </span>
            <div>
              <div className="text-xs text-muted-foreground">Balance visibility</div>
              <div className="mt-1 text-sm font-medium">{position.hasPermit ? "Private to this wallet" : "Encrypted"}</div>
            </div>
          </div>
        </section>

        <section className="product-panel rise overflow-hidden lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-col gap-5 border-b border-border/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Vault operation</div>
              <h2 className="mt-1 text-xl font-medium">Manage {meta.symbol}</h2>
            </div>
            <div className="paper-tabs" role="tablist" aria-label="Vault operation">
              <button type="button" role="tab" aria-selected={mode === "deposit"} data-active={mode === "deposit"} className="paper-tab" onClick={() => setMode("deposit")}>
                Deposit
              </button>
              <button type="button" role="tab" aria-selected={mode === "withdraw"} data-active={mode === "withdraw"} className="paper-tab" onClick={() => setMode("withdraw")}>
                Withdraw
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <div className="max-w-2xl">
              <h3 className="text-2xl font-medium">
                {mode === "deposit" ? "Move funds into the prize vault" : "Return funds to your private wallet"}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {mode === "deposit"
                  ? `The amount is encrypted before it leaves this browser. Your first ${meta.symbol} deposit also grants the vault a one-time operator approval.`
                  : "The requested amount stays encrypted. If it exceeds your position, the contract privately clamps it to your available balance."}
              </p>
            </div>

            <div className="mt-8">
              <AmountField
                id={`${mode}-amount`}
                label={mode === "deposit" ? "Amount to deposit" : "Amount to withdraw"}
                value={amount}
                onChange={setAmount}
                unit={meta.symbol}
                disabled={disabled}
                max={available !== undefined && available > 0n ? formatAmountPlain(available) : undefined}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4 text-sm">
              <span className="text-muted-foreground">Available {mode === "deposit" ? "in wallet" : "in vault"}</span>
              <span className="font-mono tabular">
                <Veil sealed={!position.hasPermit} loading={position.hasPermit && available === undefined} handle={availableHandle} className="h-5 w-24">
                  {available !== undefined ? formatAmount(available) : "0"} {meta.symbol}
                </Veil>
              </span>
            </div>

            <Button
              size="lg"
              className="mt-7 w-full"
              disabled={disabled}
              onClick={() => run(() => mode === "deposit" ? actions.deposit(parseAmount(depositAmount)) : actions.withdraw(parseAmount(withdrawAmount)))}
            >
              {mode === "deposit" && <Lock className="size-4" />}
              {busy ? "Waiting for confirmation…" : mode === "deposit" ? "Encrypt and deposit" : "Withdraw privately"}
            </Button>

            {!isConnected && <p className="mt-3 text-center text-xs text-muted-foreground">Connect your wallet to continue.</p>}

            <ol className="mt-8 grid gap-3 border-t border-border/70 pt-6 md:grid-cols-4">
              {trace.map((step, index) => (
                <li key={step} className="text-xs leading-relaxed text-muted-foreground">
                  <span className="mb-2 grid size-7 place-items-center rounded-lg bg-secondary text-[10px] font-medium text-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <aside className="rise grid gap-5 lg:col-start-2 lg:row-start-2" style={{ animationDelay: "100ms" }}>
          <section className="product-panel p-6">
            <div className="flex items-center gap-3">
              <Coins className="size-5" strokeWidth={1.7} />
              <h2 className="text-lg font-medium">Need test tokens?</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Mint public {meta.underlyingSymbol}, then shield it through Zama's official wrapper. The flow takes three transactions.
            </p>
            <Button variant="outline" className="mt-5 w-full" disabled={disabled} onClick={() => run(() => actions.shield(meta.faucetUnits))}>
              Get {formatAmount(meta.faucetUnits)} {meta.symbol}
            </Button>
          </section>

          <section className="product-subtle p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5" strokeWidth={1.7} />
              <h2 className="text-lg font-medium">Private by default</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The chain stores ciphertext handles, not amounts. Only a permit signed by this wallet lets the interface reveal its own balances.
            </p>
            {!position.hasPermit ? (
              <Button className="mt-5 w-full" disabled={disabled || position.granting || position.permitLoading} onClick={() => position.grantPermit()}>
                {position.granting ? "Waiting for signature…" : "Unseal my balances"}
              </Button>
            ) : (
              <Button render={<Link to="/account" />} variant="outline" className="mt-5 w-full">Open portfolio</Button>
            )}
          </section>

          {meta.earn && <EarnCard meta={meta} />}

          <details className="product-panel group p-6">
            <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">How fair odds are calculated <span className="float-right text-muted-foreground group-open:rotate-45">+</span></summary>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Odds use a time-weighted average balance. Depositing just before the draw adds almost no weight, while withdrawing after close cannot erase weight already earned.
            </p>
          </details>
        </aside>
      </div>
    </>
  );
}

/// The vault's live Zama Earn position: sweep amounts are public events, the
/// position's existence is provable from its cShare handle, its size stays sealed.
function EarnCard({ meta }: { meta: VaultMeta }) {
  const earn = useEarnStats(meta);
  return (
    <section className="product-panel p-6">
      <div className="flex items-center gap-3">
      <Sprout className="size-5" strokeWidth={1.7} />
        <h2 className="text-lg font-medium">Principal at work</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Idle {meta.symbol} is deployed into Zama's Confidential Vault — the rails behind Zama Earn. Deposits join a
        batch, and only the batch total is ever decrypted.
      </p>
      <dl className="mt-4 divide-y divide-border/70 border-y border-border/70 text-sm">
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-muted-foreground">Swept to Earn</dt>
          <dd className="font-mono tabular">
            {earn.sweptTotal !== undefined ? `${formatAmount(earn.sweptTotal)} ${meta.symbol}` : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-muted-foreground">cShare position</dt>
          <dd className="text-sm">{earn.hasPosition ? "Held · amount confidential" : "None yet"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        The strategist can only move funds between this vault and the official batchers — never to a wallet. On
        mainnet the same wiring earns real Morpho yield.
      </p>
      <a
        href={`https://sepolia.etherscan.io/address/${meta.vault}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4 hover:text-muted-foreground"
      >
        Verify the trail on Etherscan <ArrowUpRight className="size-3.5" />
      </a>
    </section>
  );
}

function BalanceCell({ label, value, handle, symbol, permit }: { label: string; value?: bigint; handle?: `0x${string}`; symbol: string; permit: boolean }) {
  return (
    <div className="min-h-24 border-t border-border/70 p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-3 font-mono text-xl tabular">
        <Veil sealed={!permit} loading={permit && value === undefined} handle={handle} className="h-7 w-36">
          {value !== undefined ? formatAmount(value) : "0"} {symbol}
        </Veil>
      </div>
    </div>
  );
}
