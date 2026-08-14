import { useState } from "react";
import { Coins, Lock } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { AmountField } from "@/components/AmountField";
import { PageHead } from "@/components/Layout";
import { Veil } from "@/components/Veil";
import { Button } from "@/components/ui/button";
import { findVault, formatAmount, parseAmount } from "@/lib/contracts";
import { usePosition, useVaultActions, useWrongNetwork } from "@/hooks/usePool";
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
  const [amount, setAmount] = useState("100");
  const [exit, setExit] = useState("50");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

  const mine = position.positions.find((entry) => entry.meta.vault === meta.vault);
  const disabled = !isConnected || busy || wrongNetwork;

  const trace = [
    "fhevm.encrypt(amount) — ciphertext + input proof, built in this tab",
    `${meta.symbol}.confidentialTransferFrom(you → vault, ciphertext)`,
    "vault ledger += the amount the token actually moved",
    "your TWAB accumulator starts earning weight from this block",
  ];

  return (
    <>
      <PageHead
        eyebrow={`${meta.symbol} vault`}
        title="Put money in. Take it out. Never lose it."
        lede={`Deposits are encrypted in your browser before they reach the chain. The vault only ever holds ciphertext — and your ${meta.symbol} principal is withdrawable at any moment, including mid-draw. Prizes are always paid in cUSDT, separately.`}
        aside={
          <Button render={<Link to="/vaults" />} variant="ghost" className="self-start">
            ← All vaults
          </Button>
        }
      />

      <div className="grid gap-12 py-12 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rise space-y-8">
          <section className="ledger-inset p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="label text-primary">Faucet entry</div>
                <h2 className="mt-2 text-xl font-semibold">Fund the private wallet first</h2>
              </div>
              <Coins className="size-5 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              This vault runs on <strong className="font-medium text-foreground">Zama's official confidential {meta.underlyingSymbol}</strong>{" "}
              wrapper, not a token we minted for the demo. The button mints test {meta.underlyingSymbol} from the public
              faucet and shields it through the wrapper — three transactions, after which the balance is a ciphertext
              even in your own wallet.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
              <div>
                <div className="label text-muted-foreground">Wallet balance</div>
                <div className="mt-1.5 font-mono text-xl tabular">
                  <Veil
                    sealed={!position.hasPermit}
                    loading={position.hasPermit && mine?.walletBalance === undefined}
                    handle={mine?.walletBalanceHandle}
                    className="h-7 w-40"
                  >
                    {mine?.walletBalance !== undefined ? formatAmount(mine.walletBalance) : "0"} {meta.symbol}
                  </Veil>
                </div>
              </div>
              <Button variant="outline" disabled={disabled} onClick={() => run(() => actions.shield(meta.faucetUnits))}>
                Get {formatAmount(meta.faucetUnits)} {meta.symbol}
              </Button>
            </div>
          </section>

          <div>
            <div className="paper-tabs" role="tablist" aria-label="Vault operation">
              <button type="button" role="tab" aria-selected={mode === "deposit"} data-active={mode === "deposit"} className="paper-tab" onClick={() => setMode("deposit")}>
                Deposit
              </button>
              <button type="button" role="tab" aria-selected={mode === "withdraw"} data-active={mode === "withdraw"} className="paper-tab" onClick={() => setMode("withdraw")}>
                Withdraw
              </button>
            </div>
            <section className="ledger-sheet rounded-tl-none p-7 pl-12 sm:pl-16">
              {mode === "deposit" ? (
                <>
                  <div className="folio-rule max-w-xs text-primary">Private entry / 01</div>
                  <h2 className="mt-3 text-3xl font-semibold">Deposit into the vault</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The first deposit also approves the vault as an operator on your {meta.symbol} — one extra signature, once.
                  </p>
                  <div className="mt-7">
                    <AmountField id="deposit-amount" label="Amount to save" value={amount} onChange={setAmount} disabled={disabled} />
                  </div>
                  <Button size="lg" className="mt-7 w-full" disabled={disabled} onClick={() => run(() => actions.deposit(parseAmount(amount)))}>
                    <Lock className="size-4" />
                    {busy ? "Working…" : "Encrypt & deposit"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="folio-rule max-w-xs">Private entry / 02</div>
                  <h2 className="mt-3 text-3xl font-semibold">Withdraw without revealing the balance</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Asking for more than you hold does not revert — the contract clamps the encrypted amount to your balance, so a failed withdrawal cannot leak your position.
                  </p>
                  <div className="mt-7">
                    <AmountField id="withdraw-amount" label="Amount to take out" value={exit} onChange={setExit} disabled={disabled} />
                  </div>
                  <Button size="lg" variant="secondary" className="mt-7 w-full" disabled={disabled} onClick={() => run(() => actions.withdraw(parseAmount(exit)))}>
                    Withdraw to private wallet
                  </Button>
                </>
              )}
            </section>
          </div>
        </div>

        <aside className="rise space-y-8 lg:sticky lg:top-24 lg:self-start" style={{ animationDelay: "120ms" }}>
          <section className="ledger-sheet p-7 pl-12 sm:pl-16">
            <div className="flex items-start justify-between gap-4">
              <div className="label text-muted-foreground">Private folio · In this vault</div>
              <span className="seal-stamp size-14 shrink-0">Owner<br />Only</span>
            </div>
            <div className="numeral mt-2 text-4xl">
              <Veil
                sealed={!position.hasPermit}
                loading={position.hasPermit && mine?.balance === undefined}
                handle={mine?.balanceHandle}
                className="h-10 w-48"
              >
                {mine?.balance !== undefined ? formatAmount(mine.balance) : "0"}
                <span className="ml-2 font-sans text-base font-medium tracking-normal text-muted-foreground">
                  {meta.symbol}
                </span>
              </Veil>
            </div>
            {!position.hasPermit ? (
              <Button
                variant="outline"
                className="mt-5 w-full"
                disabled={disabled || position.granting || position.permitLoading}
                onClick={() => position.grantPermit()}
              >
                {position.granting ? "Waiting for signature…" : "Unseal my balances"}
              </Button>
            ) : (
              <Button render={<Link to="/account" />} variant="ghost" className="mt-5 w-full">
                Open account →
              </Button>
            )}
          </section>

          <section className="border-l-2 border-primary pl-6">
            <div className="label text-primary">Fair odds</div>
            <h3 className="mt-2 text-xl font-semibold">Weight accrues by the second</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Odds come from a time-weighted average balance, not the balance at the closing block. Depositing one block
              before the draw buys almost nothing; withdrawing after the draw closes cannot undo the weight you already
              earned. It is PoolTogether's anti-sniping rule, kept intact under encryption.
            </p>
          </section>

          <section className="ledger-inset p-7">
            <div className="label text-muted-foreground">What the deposit button does</div>
            <ol className="mt-4 space-y-3">
              {trace.map((line, index) => (
                <li key={line} className="flex gap-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  <span className="text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
