export const POOL_ADDRESS = (import.meta.env.VITE_POOL_ADDRESS ??
  "0x1C76078391451fC60b82f529CC9c22970CEdD488") as `0x${string}`;
export const POOL_DEPLOY_BLOCK = 11554478n; // start of the public round-event trail

export type EarnMeta = {
  depositBatcher: `0x${string}`; // Zama Confidential Vault deposit batcher
  shareToken: `0x${string}`; // confidential cShare wrapper the vault's position lands in
  fromBlock: bigint; // vault deploy block — start of the public SweptToEarn trail
};

export type VaultMeta = {
  vault: `0x${string}`;
  token: `0x${string}`; // Zama's official ERC7984 confidential wrapper (6 decimals)
  underlying: `0x${string}`; // the plain ERC-20 it shields; public mint = testnet faucet
  symbol: string;
  underlyingSymbol: string;
  underlyingDecimals: number;
  faucetUnits: bigint; // confidential units minted per faucet click
  earn?: EarnMeta; // present when idle principal is deployed into Zama Earn
};

// Curated on purpose: vault registration on-chain is permissionless, so the on-chain
// registry may contain junk. This list is the interface's trusted directory — the same
// way PoolTogether front-ends curate which prize vaults they show.
export const VAULTS: VaultMeta[] = [
  {
    vault: "0x5c02f2303DcFe19aeD5b2F15b479Bd1E810AdFef",
    token: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
    underlying: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0",
    symbol: "cUSDT",
    underlyingSymbol: "USDT",
    underlyingDecimals: 6,
    faucetUnits: 1_000_000_000n, // 1,000 cUSDT
  },
  {
    vault: "0x9bdAD480616dC0c17363068B42b229eb1Ef4CD76",
    token: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    underlying: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF",
    symbol: "cUSDC",
    underlyingSymbol: "USDC",
    underlyingDecimals: 6,
    faucetUnits: 1_000_000_000n, // 1,000 cUSDC
    earn: {
      depositBatcher: "0x56E3CF41D18e58AF476C05e9B1705ac2b13862C9",
      shareToken: "0x7E93d5c150A2178B1fCde0278582Acf59478eA5f",
      fromBlock: 11554482n,
    },
  },
  {
    vault: "0xe4C075d06f9a382f40DFA84bb8ba3bfe25F350b3",
    token: "0x46208622DA27d91db4f0393733C8BA082ed83158",
    underlying: "0xff54739b16576FA5402F211D0b938469Ab9A5f3F",
    symbol: "cWETH",
    underlyingSymbol: "WETH",
    underlyingDecimals: 18,
    faucetUnits: 10_000_000n, // 10 cWETH
  },
];

// prizes are always paid in the pool's prize token (cUSDT); its underlying USDT is
// what sponsors approve and contribute as verified plaintext
export const PRIZE_VAULT = VAULTS[0];

export function findVault(address: string | undefined): VaultMeta | undefined {
  return VAULTS.find((meta) => meta.vault.toLowerCase() === address?.toLowerCase());
}

export const CONFIDENTIAL_DECIMALS = 6; // every wrapper above exposes 6 on the encrypted side
export const BATCH_SIZE = 6n; // measured HCU ceiling is 7 per tx, see DESIGN.md §8
export const ZERO_HANDLE = `0x${"0".repeat(64)}` as const;

/// The wrapper mints amount/rate confidential units; rate bridges the decimals gap.
export function toUnderlying(units: bigint, meta: VaultMeta): bigint {
  return units * 10n ** BigInt(meta.underlyingDecimals - CONFIDENTIAL_DECIMALS);
}

// encrypted types (euint64 / ebool / externalEuint64) surface as bytes32 in the ABI
export const poolAbi = [
  { type: "function", name: "state", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "roundId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "openedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "closedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "roundPeriod", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalContribution", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "vaultsPending", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "DRAW_GRACE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "contribution", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "vaultDrawn", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "reserve", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "prizeBalanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "wonLastRound", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "closeRound", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "skipVault", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
  { type: "function", name: "contribute", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export const vaultAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "participantCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "drawing", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "cursor", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "drawRound", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }, { type: "bytes" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }, { type: "bytes" }], outputs: [] },
  { type: "function", name: "beginDraw", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "advanceDraw", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;

export const tokenAbi = [
  { type: "function", name: "wrap", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "setOperator", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint48" }], outputs: [] },
  { type: "function", name: "isOperator", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "confidentialBalanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }] },
] as const;

export const underlyingAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export function formatAmount(units: bigint, decimals: number = CONFIDENTIAL_DECIMALS): string {
  const whole = units / 10n ** BigInt(decimals);
  const frac = units % 10n ** BigInt(decimals);
  if (frac === 0n) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

/// Locale-free counterpart of formatAmount, safe to feed back into parseAmount.
export function formatAmountPlain(units: bigint, decimals: number = CONFIDENTIAL_DECIMALS): string {
  const whole = units / 10n ** BigInt(decimals);
  const frac = units % 10n ** BigInt(decimals);
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function parseAmount(text: string, decimals: number = CONFIDENTIAL_DECIMALS): bigint {
  const [whole, frac = ""] = text.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}
