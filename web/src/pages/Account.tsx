import { ArrowRight, ArrowUpRight, EyeOff, Fingerprint, Gift, KeyRound, PartyPopper } from "lucide-react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { PageHead, WalletAction } from "@/components/Layout";
import { TokenIcon } from "@/components/TokenIcon";
import { Veil } from "@/components/Veil";
import { Button } from "@/components/ui/button";
import { POOL_ADDRESS, formatAmount } from "@/lib/contracts";
import { usePoolActions, usePosition, useWrongNetwork } from "@/hooks/usePool";
import { useTx } from "@/hooks/useTx";

export function Account() {
  const { address, isConnected } = useAccount();
  const position = usePosition();
  const actions = usePoolActions();
  const { busy, run } = useTx();
  const wrongNetwork = useWrongNetwork();

  // a claimed prize leaves an encrypted zero behind, so gate on the decrypted
  // amount rather than the handle's existence
  const claimable = (position.prizeBalance ?? 0n) > 0n;
  const activeVaults = position.positions.every((entry) => entry.balance !== undefined)
    ? position.positions.filter((entry) => (entry.balance ?? 0n) > 0n).length
    : undefined;

  return (
    <>
      <PageHead
        eyebrow="Portfolio"
        title="Your confidential positions"
        lede="Balances decrypt only for this wallet. Public observers can see the contracts and ciphertext handles, but never the amounts shown here."
      />

      {!isConnected ? (
        <DisconnectedPortfolio />
      ) : !position.hasPermit ? (
        <PermitPanel position={position} wrongNetwork={wrongNetwork} />
      ) : (
        <div className="space-y-6 py-8">
          {position.won && claimable && (
            <section className="rise flex flex-col gap-5 border border-foreground bg-primary p-6 sm:flex-row sm:items-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background">
                <PartyPopper className="size-5" />
              </span>
              <div className="flex-1">
                <h2 className="text-xl font-medium">Your wallet received the last prize</h2>
                <p className="mt-1 max-w-2xl text-sm text-foreground/70">
                  The draw did not identify you publicly. Every saver received an encrypted credit; only this wallet can distinguish the prize from zero.
                </p>
              </div>
            </section>
          )}

          <section className="product-panel grid overflow-hidden lg:grid-cols-[1.2fr_.8fr_.8fr]">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Gift className="size-4" strokeWidth={1.7} />
                Confidential prize balance
              </div>
              <div className="numeral mt-4 text-4xl leading-none sm:text-5xl">
                <Veil sealed={false} loading={position.prizeBalance === undefined} handle={position.prizeBalanceHandle}>
                  {position.prizeBalance !== undefined ? formatAmount(position.prizeBalance) : "0"}
                  <span className="ml-2 text-base font-medium tracking-normal text-muted-foreground">cUSDT</span>
                </Veil>
              </div>
              <Button size="lg" className="mt-6 min-w-40" disabled={!claimable || busy || wrongNetwork} onClick={() => run(actions.claim)}>
                <Gift className="size-4" />
                {busy ? "Claiming…" : "Claim prize"}
              </Button>
            </div>
            <StatCell label="Active vaults" value={activeVaults?.toString()} note={`of ${position.positions.length} available`} />
            <StatCell label="Last draw" value={position.won ? "Won" : "No win"} note="revealed only to you" />
          </section>

          <section className="product-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-lg font-medium">Vault positions</h2>
                <p className="mt-1 text-xs text-muted-foreground">Private balances across every supported asset.</p>
              </div>
              <span className="status-chip self-start sm:self-auto"><Fingerprint className="size-3" /> Decrypted locally</span>
            </div>

            <div className="hidden grid-cols-[1.1fr_1fr_1fr_.75fr_auto] gap-4 border-b border-border/70 bg-secondary/55 px-6 py-3 text-[11px] text-muted-foreground md:grid">
              <span>Asset</span>
              <span className="text-right">In vault</span>
              <span className="text-right">In wallet</span>
              <span>Privacy</span>
              <span className="w-28">Action</span>
            </div>

            <ul>
              {position.positions.map(({ meta, balance, balanceHandle, walletBalance, walletBalanceHandle }) => (
                <li key={meta.vault} className="grid gap-5 border-t border-border/70 p-5 first:border-t-0 hover:bg-white/35 md:grid-cols-[1.1fr_1fr_1fr_.75fr_auto] md:items-center md:px-6">
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={meta.underlyingSymbol} className="size-10 shrink-0" />
                    <div>
                      <div className="font-medium">{meta.symbol}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{meta.underlyingSymbol} savings</div>
                    </div>
                  </div>

                  <PositionValue label="In vault" value={balance} handle={balanceHandle} symbol={meta.symbol} />
                  <PositionValue label="In wallet" value={walletBalance} handle={walletBalanceHandle} symbol={meta.symbol} />

                  <div>
                    <div className="text-xs text-muted-foreground md:hidden">Privacy</div>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs md:mt-0">
                      <EyeOff className="size-3.5" strokeWidth={1.7} /> Confidential
                    </span>
                  </div>

                  <Button render={<Link to={`/vault/${meta.vault}`} />} variant="outline" className="w-full md:w-28">
                    Open
                    <ArrowRight className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex justify-end">
            <Button render={<Link to="/vaults" />} size="lg">
              Deposit more
              <ArrowUpRight className="size-4" />
            </Button>
          </div>

          <details className="product-panel group">
            <summary className="cursor-pointer list-none p-5 text-sm font-medium marker:hidden sm:px-6">
              Technical details and ciphertext handles
              <span className="float-right text-muted-foreground group-open:rotate-45">+</span>
            </summary>
            <div className="grid gap-8 border-t border-border p-5 sm:p-6 lg:grid-cols-2">
              <section>
                <h3 className="text-sm font-medium">Encrypted state</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  These public handles point to ciphertexts. They cannot be turned into balances without an authorization from this wallet.
                </p>
                <dl className="mt-5 space-y-4">
                  <Handle label="pool.prizeBalanceOf(you)" value={position.prizeBalanceHandle} />
                  <Handle label="pool.wonLastRound(you)" value={position.wonHandle} />
                  {position.positions.map(({ meta, balanceHandle }) => (
                    <Handle key={meta.vault} label={`${meta.symbol}Vault.balanceOf(you)`} value={balanceHandle} />
                  ))}
                </dl>
              </section>
              <section>
                <h3 className="text-sm font-medium">Addresses</h3>
                <dl className="mt-5 space-y-4">
                  <AddressRow label="You" value={address} href={`https://sepolia.etherscan.io/address/${address}`} />
                  <AddressRow label="Prize pool" value={POOL_ADDRESS} href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`} />
                  {position.positions.map(({ meta }) => (
                    <AddressRow key={meta.vault} label={`${meta.symbol} vault`} value={meta.vault} href={`https://sepolia.etherscan.io/address/${meta.vault}`} />
                  ))}
                </dl>
              </section>
            </div>
          </details>
        </div>
      )}
    </>
  );
}

function DisconnectedPortfolio() {
  return (
    <section className="product-panel my-8 grid overflow-hidden lg:grid-cols-[1.15fr_.85fr]">
      <div className="border-b border-border p-6 sm:p-8 lg:border-r lg:border-b-0">
        <div className="text-xs font-medium text-muted-foreground">Portfolio preview</div>
        <div className="mt-6 border-y border-border">
          {["cUSDT", "cUSDC", "cWETH"].map((symbol) => (
            <div key={symbol} className="grid grid-cols-[1fr_auto] items-center gap-5 border-t border-border py-4 first:border-t-0">
              <div className="flex items-center gap-3">
                <TokenIcon symbol={symbol.slice(1)} className="size-8 shrink-0" />
                <span className="text-sm font-medium">{symbol}</span>
              </div>
              <span className="font-mono text-sm tracking-[0.14em] text-muted-foreground">••••••</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-start justify-center p-7 sm:p-10">
        <span className="grid size-11 place-items-center rounded-full bg-primary"><Fingerprint className="size-5" /></span>
        <h2 className="mt-6 text-2xl font-medium">Connect to view private balances</h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Your wallet opens the portfolio locally. CachePot does not fetch private positions from an account server.
        </p>
        <div className="mt-6 min-w-48"><WalletAction full /></div>
      </div>
    </section>
  );
}

function PermitPanel({ position, wrongNetwork }: { position: ReturnType<typeof usePosition>; wrongNetwork: boolean }) {
  return (
    <section className="product-panel my-8 max-w-3xl overflow-hidden">
      <div className="h-2 bg-primary" />
      <div className="p-7 sm:p-10">
        <KeyRound className="size-6" strokeWidth={1.7} />
        <h2 className="mt-5 text-2xl font-medium">Authorize private viewing</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          One EIP-712 signature creates a seven-day decryption permit for the pool, vaults and confidential tokens. It is stored only in this browser and does not create an onchain transaction.
        </p>
        <Button size="lg" className="mt-6" disabled={position.granting || position.permitLoading || wrongNetwork} onClick={() => position.grantPermit()}>
          {position.granting ? "Waiting for signature…" : "Unseal all balances"}
        </Button>
      </div>
    </section>
  );
}

function StatCell({ label, value, note }: { label: string; value?: string; note: string }) {
  return (
    <div className="border-t border-border p-6 lg:border-t-0 lg:border-l lg:p-8">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-4 text-2xl font-medium tabular">{value ?? "—"}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function PositionValue({ label, value, handle, symbol }: { label: string; value?: bigint; handle?: `0x${string}`; symbol: string }) {
  return (
    <div className="md:text-right">
      <div className="text-xs text-muted-foreground md:hidden">{label}</div>
      <div className="mt-1 font-mono text-sm tabular md:mt-0">
        <Veil sealed={false} loading={value === undefined} handle={handle}>
          {value !== undefined ? formatAmount(value) : "0"} <span className="text-xs text-muted-foreground">{symbol}</span>
        </Veil>
      </div>
    </div>
  );
}

function Handle({ label, value }: { label: string; value?: `0x${string}` }) {
  return (
    <div>
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 border border-border bg-accent px-3 py-2 font-mono text-[11px] leading-relaxed break-all">{value ?? "—"}</dd>
    </div>
  );
}

function AddressRow({ label, value, href }: { label: string; value?: string; href: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs">
        <a className="hover:underline" href={href} target="_blank" rel="noreferrer">{value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "—"}</a>
      </dd>
    </div>
  );
}
