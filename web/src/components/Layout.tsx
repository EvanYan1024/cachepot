import type { ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BookOpenText, LayoutGrid, Trophy, WalletCards } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { PotMark } from "@/components/PotMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { POOL_ADDRESS, PRIZE_VAULT, VAULTS } from "@/lib/contracts";
import { useWrongNetwork } from "@/hooks/usePool";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview", icon: BookOpenText },
  { to: "/vaults", label: "Vaults", icon: LayoutGrid },
  { to: "/prize", label: "Draw", icon: Trophy },
  { to: "/account", label: "Portfolio", icon: WalletCards },
];

function scan(address: string) {
  return `https://sepolia.etherscan.io/address/${address}`;
}

function WrongNetworkBanner() {
  const wrong = useWrongNetwork();
  const { switchChain, isPending } = useSwitchChain();
  if (!wrong) return null;
  return (
    <div className="border-b border-primary/40 bg-primary/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
        <span className="text-sm">
          Your wallet is on another network. CachePot lives on Sepolia — encryption and decryption stay paused until you
          switch.
        </span>
        <Button size="sm" className="ml-auto" disabled={isPending} onClick={() => switchChain({ chainId: sepolia.id })}>
          {isPending ? "Switching…" : "Switch to Sepolia"}
        </Button>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grain-layer" aria-hidden="true" />

      <a
        href="#main-content"
        className="fixed top-2 left-2 z-[70] -translate-y-20 rounded-sm bg-foreground px-4 py-2 text-sm text-background focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-border bg-background/88 backdrop-blur-md">
        <div className="hidden border-b border-border/70 md:block">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-2">
            <span className="label text-muted-foreground">Confidential prize savings · Public record 001</span>
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">ETHEREUM SEPOLIA / ZAMA FHEVM</span>
          </div>
        </div>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <NavLink to="/" className="group flex shrink-0 items-center gap-2.5">
            <PotMark className="size-7 text-primary transition-transform duration-500 group-hover:-rotate-6" />
            <span className="font-display text-[1.35rem] font-semibold tracking-tight">CachePot</span>
          </NavLink>

          <nav aria-label="Primary navigation" className="hidden flex-1 items-center gap-7 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "label relative py-5 transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      className={cn(
                        "absolute inset-x-0 -bottom-px h-0.5 origin-left bg-primary transition-transform duration-300",
                        isActive ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>
        </div>

      </header>

      <WrongNetworkBanner />

      <main id="main-content" className="mx-auto max-w-6xl px-5 pb-32 sm:px-8 md:pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 overflow-hidden rounded-lg border border-border bg-card/94 shadow-[0_16px_50px_rgb(0_0_0/0.22)] backdrop-blur-md md:hidden"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 border-r border-border text-[9px] font-mono tracking-[0.1em] uppercase last:border-r-0",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-4" strokeWidth={1.7} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <footer className="border-t border-border bg-card/35">
        <div className="mx-auto max-w-6xl px-5 pt-8 sm:px-8">
          <div className="folio-rule">Filed as CachePot protocol record</div>
        </div>
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-3">
          <div>
            <div className="label text-muted-foreground">Deployed on</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="font-mono text-sm">Ethereum Sepolia · Zama FHEVM</span>
            </div>
          </div>
          <div>
            <div className="label text-muted-foreground">Contracts</div>
            <div className="mt-2 space-y-1 font-mono text-sm">
              <a className="block underline-offset-4 hover:text-primary hover:underline" href={scan(POOL_ADDRESS)} target="_blank" rel="noreferrer">
                CachePrizePool {POOL_ADDRESS.slice(0, 8)}…{POOL_ADDRESS.slice(-4)}
              </a>
              {VAULTS.map((meta) => (
                <a
                  key={meta.vault}
                  className="block underline-offset-4 hover:text-primary hover:underline"
                  href={scan(meta.vault)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Vault {meta.symbol} {meta.vault.slice(0, 8)}…{meta.vault.slice(-4)}
                </a>
              ))}
              <a className="block underline-offset-4 hover:text-primary hover:underline" href={scan(PRIZE_VAULT.token)} target="_blank" rel="noreferrer">
                cUSDT {PRIZE_VAULT.token.slice(0, 8)}…{PRIZE_VAULT.token.slice(-4)}
              </a>
            </div>
          </div>
          <div>
            <div className="label text-muted-foreground">Verifiability</div>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Every draw step is a public transaction. Every balance is a ciphertext. Anyone can replay the round; nobody
              can read the ledger.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  lede,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="rise grid gap-7 border-b border-border py-10 md:grid-cols-[3.25rem_minmax(0,1fr)_auto] md:items-end md:py-14">
      <div className="hidden h-full border-r border-primary/35 pr-4 md:flex md:items-start md:justify-end">
        <span className="ledger-number [writing-mode:vertical-rl]">FILE / {eyebrow}</span>
      </div>
      <div className="max-w-3xl">
        <div className="folio-rule max-w-sm text-primary">{eyebrow}</div>
        <h1 className="mt-4 text-4xl leading-[1.02] font-semibold sm:text-5xl">{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{lede}</p>}
      </div>
      {aside}
    </div>
  );
}
