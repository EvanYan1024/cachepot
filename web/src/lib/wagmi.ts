import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { sepolia } from "wagmi/chains";

export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const wagmiConfig = getDefaultConfig({
  appName: "CachePot",
  // injected wallets work with the placeholder; set a WalletConnect Cloud id for mobile wallets
  projectId: import.meta.env.VITE_WC_PROJECT_ID ?? "cachepot-demo",
  chains: [sepolia],
  transports: { [sepolia.id]: http(SEPOLIA_RPC) },
});
