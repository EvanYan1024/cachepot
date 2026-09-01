import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";
import { sepolia } from "wagmi/chains";

// Tenderly first: publicnode load-balances onto backends with thin log indexes
// that silently truncate eth_getLogs, so it is the backup, not the default.
// Override with VITE_SEPOLIA_RPC (e.g. an Alchemy/Infura key) for higher limits.
export const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC ?? "https://sepolia.gateway.tenderly.co";
const BACKUP_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// JSON-RPC batching folds bursts (archive snapshots, block-timestamp lookups)
// into a few HTTP posts — the public gateways rate-limit requests, not calls
const BATCH = { batch: { batchSize: 10, wait: 16 } } as const;

export const wagmiConfig = getDefaultConfig({
  appName: "CachePot",
  // injected wallets work with the placeholder; set a WalletConnect Cloud id for mobile wallets
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "cachepot-demo",
  chains: [sepolia],
  transports: { [sepolia.id]: fallback([http(SEPOLIA_RPC, BATCH), http(BACKUP_RPC, BATCH)]) },
});
