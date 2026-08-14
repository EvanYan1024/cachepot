import { createConfig } from "@zama-fhe/react-sdk/wagmi";
import { sepolia as sepoliaFhe } from "@zama-fhe/sdk/chains";
import { web } from "@zama-fhe/sdk/web";
import { wagmiConfig } from "./wagmi";

// Sepolia preset ships the public keyless testnet relayer; an API key (proxied
// through a backend) is only needed against the hosted mainnet relayer.
export const zamaConfig = createConfig({
  chains: [sepoliaFhe],
  wagmiConfig,
  relayers: { [sepoliaFhe.id]: web() },
});
