import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as sepoliaFhe } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { SEPOLIA_RPC, wagmiConfig } from "./wagmi";

// Sepolia preset ships the public keyless testnet relayer; an API key (proxied
// through a backend) is only needed against the hosted mainnet relayer.
// The preset reads the ACL over publicnode, which drops eth_call under load and fails
// the whole decrypt batch; use the same gateway the rest of the app reads through.
export const zamaConfig = createConfig({
  chains: [{ ...sepoliaFhe, network: SEPOLIA_RPC }],
  wagmiConfig,
  relayers: { [sepoliaFhe.id]: web() },
});
