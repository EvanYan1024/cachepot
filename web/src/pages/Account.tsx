import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Gift, KeyRound, PartyPopper } from "lucide-react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { PageHead } from "@/components/Layout";
import { Veil } from "@/components/Veil";
import { Button } from "@/components/ui/button";
import { POOL_ADDRESS, ZERO_HANDLE, formatAmount } from "@/lib/contracts";
import { usePoolActions, usePosition, useWrongNetwork } from "@/hooks/usePool";
import { useTx } from "@/hooks/useTx";

export function Account() {
  const { address, isConnected } = useAccount();
  const position = usePosition();
  const actions = usePoolActions();
  const { busy, run } = useTx();
  const wrongNetwork = useWrongNetwork();

  const claimable = position.prizeBalanceHandle !== undefined && position.prizeBalanceHandle !== ZERO_HANDLE;

  return (
    <>
      <PageHead
        eyebrow="Account"
        title="Only this wallet can read this page."
        lede="The numbers below do not exist on-chain. What exists is a handle to a ciphertext, and an access-control entry saying your address may ask the relayer to decrypt it."
      />

      {!isConnected ? (
        <div className="rise flex flex-col items-start gap-5 rounded-lg border border-border bg-card p-10 py-16">
          <h2 className="text-2xl font-semibold">Connect a wallet to continue.</h2>
          <p className="max-w-md text-muted-foreground">
            Nothing here is fetched from a server — your position is decrypted locally, in this tab.
          </p>
          <ConnectButton />
        </div>
      ) : !position.hasPermit ? (
        <div className="rise mt-12 max-w-2xl rounded-lg border border-border bg-card p-10">
          <KeyRound className="size-6 text-primary" />
          <h2 className="mt-5 text-3xl font-semibold">Unseal your balances</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            One EIP-712 signature issues a decryption permit for the prize pool, every vault and every confidential
            token, valid for seven days and stored only in this browser. After that, every private value on this site
            decrypts by itself and refreshes after each transaction — no signing pop-up per glance.
          </p>
          <Button
            size="lg"
            className="mt-7"
            disabled={position.granting || position.permitLoading || wrongNetwork}
            onClick={() => position.grantPermit()}
          >
            {position.granting ? "Waiting for signature…" : "Sign the permit"}
          </Button>
          <div className="hatch veil-drift mt-10 h-16 rounded-sm border border-border" />
        </div>
      ) : (
        <div className="grid gap-12 py-12 lg:grid-cols-[1.15fr_1fr]">
          <div className="rise space-y-8">
            {position.won && (
              <section className="relative overflow-hidden rounded-lg border-2 border-primary bg-card p-8">
                <PartyPopper className="size-6 text-primary" />
                <h2 className="mt-4 text-3xl font-semibold">You took the last prize.</h2>
                <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">
                  No event announced it, no transfer singled you out — every saver of every vault received a prize
                  credit in the same round, and all the others were encrypted zeros. Claim it below whenever you like.
                </p>
              </section>
            )}

            <section className="rounded-lg border border-border bg-card p-8">
              <div className="flex items-baseline justify-between gap-4">
                <div className="label text-muted-foreground">Prize balance</div>
                <Gift className="size-5 text-muted-foreground" />
              </div>
              <div className="numeral mt-3 text-5xl leading-none">
                <Veil
                  sealed={false}
                  loading={position.prizeBalance === undefined}
                  handle={position.prizeBalanceHandle}
                  className="h-12 w-56"
                >
                  {position.prizeBalance !== undefined ? formatAmount(position.prizeBalance) : "0"}
                  <span className="ml-2 font-sans text-lg font-medium tracking-normal text-muted-foreground">cUSDT</span>
                </Veil>
              </div>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Prizes live in their own encrypted ledger, separate from your deposits, and are always paid in cUSDT.
                Anyone can press claim — losers just move an encrypted zero, so the claim itself proves nothing.
              </p>
              <Button
                size="lg"
                className="mt-6"
                disabled={!claimable || busy || wrongNetwork}
                onClick={() => run(actions.claim)}
              >
                Claim as cUSDT
              </Button>
            </section>

            <section className="rounded-lg border border-border bg-card p-8">
              <div className="label text-muted-foreground">Saved across the vaults</div>
              <ul className="mt-5 space-y-px bg-border">
                {position.positions.map(({ meta, balance, balanceHandle, walletBalance, walletBalanceHandle }) => (
                  <li key={meta.vault} className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-card py-4">
                    <span className="w-16 font-mono text-sm">{meta.symbol}</span>
                    <div className="min-w-32 flex-1">
                      <div className="label text-muted-foreground">In the vault</div>
                      <div className="mt-1 font-mono text-lg tabular">
                        <Veil sealed={false} loading={balance === undefined} handle={balanceHandle} className="h-6 w-28">
                          {balance !== undefined ? formatAmount(balance) : "0"}
                        </Veil>
                      </div>
                    </div>
                    <div className="min-w-32 flex-1">
                      <div className="label text-muted-foreground">In your wallet</div>
                      <div className="mt-1 font-mono text-lg tabular">
                        <Veil
                          sealed={false}
                          loading={walletBalance === undefined}
                          handle={walletBalanceHandle}
                          className="h-6 w-28"
                        >
                          {walletBalance !== undefined ? formatAmount(walletBalance) : "0"}
                        </Veil>
                      </div>
                    </div>
                    <Button render={<Link to={`/vault/${meta.vault}`} />} size="sm" variant="outline">
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-6">
                <div className="mr-auto">
                  <div className="label text-muted-foreground">Last draw</div>
                  <div className="mt-1.5 font-mono text-lg">{position.won ? "Won" : "No win"}</div>
                </div>
                <Button render={<Link to="/vaults" />} size="lg">
                  Deposit more
                </Button>
              </div>
            </section>
          </div>

          <aside className="rise space-y-8" style={{ animationDelay: "120ms" }}>
            <section className="rounded-lg border border-border p-7">
              <div className="label text-primary">What the chain actually stores</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                These are the ciphertext handles behind the numbers on the left. Anyone can read them from the
                contracts; nobody can turn them back into values without a signature from your address.
              </p>
              <dl className="mt-6 space-y-5">
                <Handle label="pool.prizeBalanceOf(you)" value={position.prizeBalanceHandle} />
                <Handle label="pool.wonLastRound(you)" value={position.wonHandle} />
                {position.positions.map(({ meta, balanceHandle }) => (
                  <Handle key={meta.vault} label={`${meta.symbol}Vault.balanceOf(you)`} value={balanceHandle} />
                ))}
              </dl>
            </section>

            <section className="rounded-lg border border-border p-7">
              <div className="label text-muted-foreground">Addresses</div>
              <dl className="mt-4 space-y-4 text-sm">
                <Row label="You" value={address} href={`https://sepolia.etherscan.io/address/${address}`} />
                <Row
                  label="CachePrizePool"
                  value={POOL_ADDRESS}
                  href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`}
                />
                {position.positions.map(({ meta }) => (
                  <Row
                    key={meta.vault}
                    label={`${meta.symbol} vault`}
                    value={meta.vault}
                    href={`https://sepolia.etherscan.io/address/${meta.vault}`}
                  />
                ))}
              </dl>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function Handle({ label, value }: { label: string; value?: `0x${string}` }) {
  return (
    <div>
      <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 rounded-sm border border-border bg-card px-3 py-2 font-mono text-[11px] leading-relaxed break-all">
        {value ?? "—"}
      </dd>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value?: string; href: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="label text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs">
        <a className="underline-offset-4 hover:text-primary hover:underline" href={href} target="_blank" rel="noreferrer">
          {value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "—"}
        </a>
      </dd>
    </div>
  );
}
