import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";
import { sepolia } from "wagmi/chains";

// Sentio first: it serves 45k-block eth_getLogs, archive reads and JSON-RPC batches
// without the Tenderly gateway's rate limits. publicnode load-balances onto backends
// with thin log indexes that silently truncate eth_getLogs, so it stays last.
// Override with VITE_SEPOLIA_RPC (e.g. an Alchemy/Infura key) for higher limits.
export const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC ?? "https://sepolia.rpc.sentio.xyz";
const BACKUP_RPCS = ["https://sepolia.gateway.tenderly.co", "https://ethereum-sepolia-rpc.publicnode.com"];

// JSON-RPC batching folds bursts (archive snapshots, block-timestamp lookups)
// into a few HTTP posts — the public gateways rate-limit requests, not calls
const BATCH = { batch: { batchSize: 10, wait: 16 } } as const;

export const wagmiConfig = getDefaultConfig({
  appName: "CachePot",
  // injected wallets work with the placeholder; set a WalletConnect Cloud id for mobile wallets
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "cachepot-demo",
  chains: [sepolia],
  transports: { [sepolia.id]: fallback([SEPOLIA_RPC, ...BACKUP_RPCS].map((url) => http(url, BATCH))) },
});
