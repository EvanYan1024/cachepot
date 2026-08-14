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

      <div className="grid gap-12 py-12 lg:grid-cols-[1.15fr_1fr]">
        <div className="rise space-y-10">
          <section className="rounded-lg border border-border bg-card p-7">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="label text-primary">Step 01</div>
                <h2 className="mt-2 text-2xl font-semibold">Get test tokens</h2>
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

          <section className="rounded-lg border border-border bg-card p-7">
            <div className="label text-primary">Step 02</div>
            <h2 className="mt-2 text-2xl font-semibold">Deposit into the vault</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The first deposit also approves the vault as an operator on your {meta.symbol} — that is one extra
              signature, once.
            </p>
            <div className="mt-6">
              <AmountField id="deposit-amount" label="Amount to save" value={amount} onChange={setAmount} disabled={disabled} />
            </div>
            <Button
              size="lg"
              className="mt-6 w-full"
              disabled={disabled}
              onClick={() => run(() => actions.deposit(parseAmount(amount)))}
            >
              <Lock className="size-4" />
              {busy ? "Working…" : "Encrypt & deposit"}
            </Button>
          </section>

          <section className="rounded-lg border border-border p-7">
            <div className="label text-muted-foreground">Anytime</div>
            <h2 className="mt-2 text-2xl font-semibold">Withdraw</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Asking for more than you hold does not revert — the contract clamps the encrypted amount to your balance,
              so a failed withdrawal cannot leak the size of your position.
            </p>
            <div className="mt-6">
              <AmountField
                id="withdraw-amount"
                label="Amount to take out"
                value={exit}
                onChange={setExit}
                disabled={disabled}
              />
            </div>
            <Button
              size="lg"
              variant="secondary"
              className="mt-6 w-full"
              disabled={disabled}
              onClick={() => run(() => actions.withdraw(parseAmount(exit)))}
            >
              Withdraw
            </Button>
          </section>
        </div>

        <aside className="rise space-y-8 lg:sticky lg:top-24 lg:self-start" style={{ animationDelay: "120ms" }}>
          <section className="rounded-lg border border-border bg-card p-7">
            <div className="label text-muted-foreground">In this vault</div>
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

          <section className="rounded-lg border border-border p-7">
            <div className="label text-primary">Fair odds</div>
            <h3 className="mt-2 text-xl font-semibold">Weight accrues by the second</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Odds come from a time-weighted average balance, not the balance at the closing block. Depositing one block
              before the draw buys almost nothing; withdrawing after the draw closes cannot undo the weight you already
              earned. It is PoolTogether's anti-sniping rule, kept intact under encryption.
            </p>
          </section>

          <section className="rounded-lg border border-border p-7">
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
