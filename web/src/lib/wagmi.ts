import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";
import { sepolia } from "wagmi/chains";

// Tenderly first: publicnode load-balances onto backends with thin log indexes
// that silently truncate eth_getLogs, so it is the backup, not the default.
export const SEPOLIA_RPC = "https://sepolia.gateway.tenderly.co";
const BACKUP_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const wagmiConfig = getDefaultConfig({
  appName: "CachePot",
  // injected wallets work with the placeholder; set a WalletConnect Cloud id for mobile wallets
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "cachepot-demo",
  chains: [sepolia],
  transports: { [sepolia.id]: fallback([http(SEPOLIA_RPC), http(BACKUP_RPC)]) },
});
