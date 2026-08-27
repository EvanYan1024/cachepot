import { useEffect, useState, type ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ExternalLink, Home, Menu, PiggyBank, Trophy, WalletCards, X } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { PotMark } from "@/components/PotMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { POOL_ADDRESS, PRIZE_VAULT, VAULTS } from "@/lib/contracts";
import { useWrongNetwork } from "@/hooks/usePool";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/vaults", label: "Save", icon: PiggyBank },
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
    <div className="mx-auto mt-4 flex max-w-[1240px] flex-wrap items-center gap-3 rounded-xl border border-primary/45 bg-primary/15 px-4 py-3">
      <span className="text-sm">CachePot runs on Sepolia. Switch networks to resume private actions.</span>
      <Button size="sm" className="ml-auto" disabled={isPending} onClick={() => switchChain({ chainId: sepolia.id })}>
        {isPending ? "Switching…" : "Switch to Sepolia"}
      </Button>
    </div>
  );
}

export function WalletAction({ compact = false, full = false }: { compact?: boolean; full?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, authenticationStatus, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain;
        const label = !connected ? "Connect wallet" : chain.unsupported ? "Wrong network" : account.displayName;
        const action = !connected ? openConnectModal : chain.unsupported ? openChainModal : openAccountModal;

        return (
          <Button className={cn(full ? "w-full" : "w-auto", compact && "h-10 px-4 text-sm")} disabled={!ready} onClick={action}>
            <WalletCards className="size-4" />
            {label}
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav aria-label={mobile ? "Mobile navigation" : "Primary navigation"} className={mobile ? "space-y-1.5" : "flex items-center gap-1"}>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            cn(
              "flex h-10 items-center gap-2 rounded-xl border border-transparent px-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:translate-y-px",
              mobile && "h-11 gap-3",
              isActive ? "nav-active text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )
          }
        >
          <item.icon className={cn("size-4", !mobile && "hidden xl:block")} strokeWidth={1.65} />
          {item.label}
        </NavLink>
      ))}
      <Link
        to="/#how-it-works"
        className={cn(
          "flex h-10 items-center rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          mobile && "h-11",
        )}
      >
        How it works
      </Link>
    </nav>
  );
}

export function Layout() {
  const { pathname, hash } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    requestAnimationFrame(() => {
      if (hash) document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [pathname, hash]);

  return (
    <div className="min-h-dvh text-foreground">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-xl bg-foreground px-4 py-2 text-sm text-background focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
        <div className="app-surface mx-auto flex h-16 max-w-[1240px] items-center rounded-xl px-3 sm:px-4">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary shadow-[0_8px_18px_rgb(255_217_26/0.24)]">
              <PotMark className="size-[18px] transition-transform duration-200 group-hover:-rotate-6" />
            </span>
            <span className="text-lg font-semibold tracking-[-0.045em]">CachePot</span>
          </Link>

          <div className="mx-auto hidden lg:block"><Navigation /></div>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <span className="mr-1 hidden items-center gap-2 text-xs text-muted-foreground xl:inline-flex">
              <span className="size-2 rounded-full bg-primary" /> Sepolia
            </span>
            <ThemeToggle />
            <WalletAction compact />
          </div>

          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-xl text-foreground hover:bg-card"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="app-surface mx-auto mt-2 max-w-[1240px] rounded-xl p-3 lg:hidden">
            <Navigation mobile />
            <div className="mt-3 border-t border-border/70 pt-3"><WalletAction compact full /></div>
          </div>
        )}
      </header>

      <WrongNetworkBanner />

      <main id="main-content" className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1240px] px-4 pb-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 border-t border-border/70 py-8 text-sm md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5 font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary"><PotMark className="size-4" /></span>
              CachePot
            </Link>
            <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">Confidential prize savings on Zama FHEVM. Save familiar assets without publishing balances or winners.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <Link to="/vaults" className="hover:text-foreground">Vaults</Link>
            <Link to="/prize" className="hover:text-foreground">Draw</Link>
            <Link to="/account" className="hover:text-foreground">Portfolio</Link>
            <a href={scan(POOL_ADDRESS)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Contracts <ExternalLink className="size-3" /></a>
            <span>{VAULTS.length} vaults</span>
            <a href={scan(PRIZE_VAULT.token)} target="_blank" rel="noreferrer" className="hover:text-foreground">Prize token ↗</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageHead({ eyebrow, title, lede, aside }: { eyebrow: string; title: ReactNode; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="rise flex flex-col gap-5 py-9 md:flex-row md:items-end md:justify-between lg:py-12">
      <div className="max-w-3xl">
        <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div>
        <h1 className="mt-3 text-3xl leading-[1.05] font-semibold sm:text-[2.6rem]">{title}</h1>
        {lede && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{lede}</p>}
      </div>
      {aside}
    </div>
  );
}
