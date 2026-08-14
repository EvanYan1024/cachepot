import type { ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
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
  { to: "/", label: "Overview" },
  { to: "/vaults", label: "Vaults" },
  { to: "/prize", label: "Prize" },
  { to: "/account", label: "Account" },
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

      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <NavLink to="/" className="group flex shrink-0 items-center gap-2.5">
            <PotMark className="size-7 text-primary transition-transform duration-500 group-hover:-rotate-6" />
            <span className="font-display text-[1.35rem] font-semibold tracking-tight">CachePot</span>
          </NavLink>

          <nav className="hidden flex-1 items-center gap-7 md:flex">
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

        <nav className="flex items-center gap-6 overflow-x-auto border-t border-border px-5 py-3 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn("label whitespace-nowrap", isActive ? "text-primary" : "text-muted-foreground")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <WrongNetworkBanner />

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-border">
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
    <div className="rise flex flex-col gap-6 border-b border-border py-12 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="label text-primary">{eyebrow}</div>
        <h1 className="mt-3 text-4xl leading-[1.05] font-semibold sm:text-5xl">{title}</h1>
        {lede && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lede}</p>}
      </div>
      {aside}
    </div>
  );
}
