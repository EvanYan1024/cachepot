import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDecryptValues, useEncrypt, useGrantPermit, useHasPermit, useZamaSDK } from "@zama-fhe/react-sdk";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { parseAbiItem, type ContractFunctionParameters } from "viem";
import { sepolia } from "wagmi/chains";
import { toast } from "sonner";
import {
  BATCH_SIZE,
  POOL_ADDRESS,
  PRIZE_VAULT,
  VAULTS,
  ZERO_HANDLE,
  poolAbi,
  tokenAbi,
  toUnderlying,
  underlyingAbi,
  vaultAbi,
  type VaultMeta,
} from "@/lib/contracts";
import { useNow } from "@/hooks/useNow";

const pool = { address: POOL_ADDRESS, abi: poolAbi } as const;

/// The Zama SDK only finishes initialising once the wallet sits on a chain it
/// has an FHEVM config for — on any other chain every decryption would hang
/// forever inside `await fhevm.ready`, so we gate the queries on this instead.
export function useWrongNetwork(): boolean {
  const { isConnected, chainId } = useAccount();
  return isConnected && chainId !== sepolia.id;
}

export function usePoolState() {
  const { data, refetch } = useReadContracts({
    contracts: [
      { ...pool, functionName: "state" },
      { ...pool, functionName: "roundId" },
      { ...pool, functionName: "openedAt" },
      { ...pool, functionName: "roundPeriod" },
      { ...pool, functionName: "closedAt" },
      { ...pool, functionName: "totalContribution" },
      { ...pool, functionName: "vaultsPending" },
      { ...pool, functionName: "DRAW_GRACE" },
      { ...pool, functionName: "reserve" },
    ],
    query: { refetchInterval: 10_000 },
  });
  const [state, roundId, openedAt, roundPeriod, closedAt, totalContribution, vaultsPending, grace, reserve] =
    data?.map((entry) => entry.result) ?? [];
  return {
    refetch,
    state: state as number | undefined,
    roundId: roundId as bigint | undefined,
    openedAt: openedAt as bigint | undefined,
    roundPeriod: roundPeriod as bigint | undefined,
    closedAt: closedAt as bigint | undefined,
    totalContribution: totalContribution as bigint | undefined,
    vaultsPending: vaultsPending as bigint | undefined,
    grace: grace as bigint | undefined,
    reserveHandle: reserve as `0x${string}` | undefined,
  };
}

export type VaultStats = {
  meta: VaultMeta;
  contribution: bigint | undefined;
  drawn: boolean | undefined;
  participantCount: bigint | undefined;
  drawing: boolean | undefined;
  cursor: bigint | undefined;
};

/// Public directory data: contributions (and therefore odds) are plaintext by design.
export function useVaultStats(): VaultStats[] {
  const { data } = useReadContracts({
    contracts: VAULTS.flatMap((meta) => [
      { ...pool, functionName: "contribution", args: [meta.vault] } as const,
      { ...pool, functionName: "vaultDrawn", args: [meta.vault] } as const,
      { address: meta.vault, abi: vaultAbi, functionName: "participantCount" } as const,
      { address: meta.vault, abi: vaultAbi, functionName: "drawing" } as const,
      { address: meta.vault, abi: vaultAbi, functionName: "cursor" } as const,
    ]),
    query: { refetchInterval: 10_000 },
  });
  return VAULTS.map((meta, i) => {
    const slice = data?.slice(i * 5, i * 5 + 5).map((entry) => entry.result);
    return {
      meta,
      contribution: slice?.[0] as bigint | undefined,
      drawn: slice?.[1] as boolean | undefined,
      participantCount: slice?.[2] as bigint | undefined,
      drawing: slice?.[3] as boolean | undefined,
      cursor: slice?.[4] as bigint | undefined,
    };
  });
}

const SWEPT_EVENT = parseAbiItem("event SweptToEarn(uint64 requested)");

/// Public trail of the vault's Zama Earn position: sweep amounts are plaintext
/// events, and a non-zero cShare balance handle proves the position exists —
/// while the position size itself stays confidential.
export function useEarnStats(meta: VaultMeta) {
  const publicClient = usePublicClient();
  const enabled = !!meta.earn;
  const { data } = useReadContracts({
    contracts: [
      {
        address: meta.earn?.shareToken ?? meta.token,
        abi: tokenAbi,
        functionName: "confidentialBalanceOf",
        args: [meta.vault],
      },
    ],
    query: { enabled, refetchInterval: 30_000 },
  });
  const shareHandle = data?.[0]?.result as `0x${string}` | undefined;
  const swept = useQuery({
    queryKey: ["earn-swept", meta.vault],
    queryFn: async () => {
      const logs = await publicClient!.getLogs({
        address: meta.vault,
        event: SWEPT_EVENT,
        fromBlock: meta.earn!.fromBlock,
      });
      return logs.reduce((sum, log) => sum + (log.args.requested ?? 0n), 0n);
    },
    enabled: enabled && !!publicClient,
    refetchInterval: 60_000,
  });
  return {
    active: enabled,
    sweptTotal: swept.data,
    hasPosition: !!shareHandle && shareHandle !== ZERO_HANDLE,
  };
}

/// Derived round clock, shared by the prize page and the landing teaser.
export function useRound() {
  const state = usePoolState();
  const now = useNow();
  const closeAt =
    state.openedAt !== undefined && state.roundPeriod !== undefined
      ? Number(state.openedAt + state.roundPeriod)
      : undefined;
  const secondsLeft = closeAt !== undefined ? closeAt - now : undefined;
  const drawing = state.state === 1;
  const graceOver =
    drawing && state.closedAt !== undefined && state.grace !== undefined
      ? now >= Number(state.closedAt + state.grace)
      : false;
  return {
    ...state,
    drawing,
    secondsLeft,
    graceOver,
    closable:
      !drawing &&
      secondsLeft !== undefined &&
      secondsLeft <= 0 &&
      state.totalContribution !== undefined &&
      state.totalContribution > 0n,
  };
}

/// The reserve is marked publicly decryptable on-chain; anyone can resolve it.
/// A zero handle means it was never funded — that decrypts trivially to 0.
export function usePrizeAmount(handle: `0x${string}` | undefined) {
  const sdk = useZamaSDK();
  const wrongNetwork = useWrongNetwork();
  return useQuery({
    queryKey: ["prize", handle],
    queryFn: async () => {
      if (handle === ZERO_HANDLE) return 0n;
      const { clearValues } = await sdk.decryption.decryptPublicValues([handle!]);
      return BigInt(clearValues[handle!] as bigint | string);
    },
    enabled: !!handle && !wrongNetwork,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useMyHandles() {
  const { address } = useAccount();
  // heterogeneous batch defeats wagmi's tuple inference; results are cast below
  const contracts: ContractFunctionParameters[] = [
    { ...pool, functionName: "prizeBalanceOf", args: [address!] },
    { ...pool, functionName: "wonLastRound", args: [address!] },
    ...VAULTS.flatMap((meta) => [
      { address: meta.vault, abi: vaultAbi, functionName: "balanceOf", args: [address!] },
      { address: meta.token, abi: tokenAbi, functionName: "confidentialBalanceOf", args: [address!] },
    ]),
  ];
  const { data, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const results = data?.map((entry) => entry.result);
  return {
    refetch,
    prizeBalanceHandle: results?.[0] as `0x${string}` | undefined,
    wonHandle: results?.[1] as `0x${string}` | undefined,
    vaultHandles: VAULTS.map((meta, i) => ({
      meta,
      balanceHandle: results?.[2 + i * 2] as `0x${string}` | undefined,
      walletBalanceHandle: results?.[3 + i * 2] as `0x${string}` | undefined,
    })),
  };
}

// one permit covers the pool, every vault and every confidential token
const PERMITTED = [POOL_ADDRESS, ...VAULTS.map((meta) => meta.vault), ...VAULTS.map((meta) => meta.token)];

export type VaultPosition = {
  meta: VaultMeta;
  balanceHandle: `0x${string}` | undefined;
  walletBalanceHandle: `0x${string}` | undefined;
  balance: bigint | undefined;
  walletBalance: bigint | undefined;
};

/// Permit-gated declarative decryption: one signature covers the whole protocol,
/// after which every private value decrypts automatically and re-decrypts whenever
/// its on-chain handle changes (deposit, draw, claim, transfer).
export function usePosition() {
  const { prizeBalanceHandle, wonHandle, vaultHandles } = useMyHandles();
  const permit = useHasPermit({ contractAddresses: PERMITTED });
  const grant = useGrantPermit({
    onError: (error) => toast.error("Authorization failed", { description: String(error).slice(0, 140) }),
  });

  const sealed = (handle: `0x${string}` | undefined) => !!handle && handle !== ZERO_HANDLE;
  const inputs = [
    ...[prizeBalanceHandle, wonHandle]
      .filter(sealed)
      .map((encryptedValue) => ({ encryptedValue: encryptedValue!, contractAddress: POOL_ADDRESS })),
    ...vaultHandles.flatMap(({ meta, balanceHandle, walletBalanceHandle }) => [
      ...(sealed(balanceHandle) ? [{ encryptedValue: balanceHandle!, contractAddress: meta.vault }] : []),
      ...(sealed(walletBalanceHandle) ? [{ encryptedValue: walletBalanceHandle!, contractAddress: meta.token }] : []),
    ]),
  ];

  const wrongNetwork = useWrongNetwork();
  const decrypted = useDecryptValues(inputs, {
    enabled: permit.data === true && inputs.length > 0 && !wrongNetwork,
    retry: 1,
  } as Parameters<typeof useDecryptValues>[1]);

  /// A zero handle means the slot was never written — that decrypts to 0 without a round trip.
  const read = (handle: `0x${string}` | undefined) =>
    !sealed(handle) ? 0n : decrypted.data ? BigInt(decrypted.data[handle!] as bigint) : undefined;

  return {
    hasPermit: permit.data === true,
    permitLoading: permit.isLoading,
    grantPermit: () => grant.mutateAsync(PERMITTED),
    granting: grant.isPending,
    decrypting: decrypted.isLoading,
    prizeBalanceHandle,
    wonHandle,
    prizeBalance: read(prizeBalanceHandle),
    won: sealed(wonHandle) && decrypted.data ? Boolean(decrypted.data[wonHandle!]) : false,
    positions: vaultHandles.map(
      ({ meta, balanceHandle, walletBalanceHandle }): VaultPosition => ({
        meta,
        balanceHandle,
        walletBalanceHandle,
        balance: read(balanceHandle),
        walletBalance: read(walletBalanceHandle),
      }),
    ),
  };
}

function useSend() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  return async function send(description: string, request: Parameters<typeof writeContractAsync>[0]) {
    const hash = await writeContractAsync(request);
    toast.loading(description, { id: hash });
    await publicClient!.waitForTransactionReceipt({ hash });
    toast.success(description, { id: hash, description: "Confirmed" });
    await queryClient.invalidateQueries();
  };
}

/// Deposit-side actions for one vault: faucet, shield, deposit, withdraw.
export function useVaultActions(meta: VaultMeta) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const encrypt = useEncrypt();
  const send = useSend();

  async function ensureOperator() {
    const isOperator = await publicClient!.readContract({
      address: meta.token,
      abi: tokenAbi,
      functionName: "isOperator",
      args: [address!, meta.vault],
    });
    if (isOperator) return;
    await send(`Approving the ${meta.symbol} vault as token operator`, {
      address: meta.token,
      abi: tokenAbi,
      functionName: "setOperator",
      args: [meta.vault, 2n ** 48n - 1n],
    });
  }

  async function encryptAmount(units: bigint) {
    toast.info("Encrypting amount locally…");
    const { encryptedValues, inputProof } = await encrypt.mutateAsync({
      values: [{ type: "euint64", value: units }],
      contractAddress: meta.vault,
      userAddress: address!,
    });
    return { handle: encryptedValues[0], proof: inputProof };
  }

  return {
    /// Faucet + shield: the public mint lives on the plain ERC-20, so getting a
    /// spendable confidential balance means mint -> approve -> wrap. `units` are
    /// confidential (6-decimal) units; the wrapper's rate bridges the decimals gap.
    shield: async (units: bigint) => {
      const raw = toUnderlying(units, meta);
      await send(`Minting test ${meta.underlyingSymbol}`, {
        address: meta.underlying,
        abi: underlyingAbi,
        functionName: "mint",
        args: [address!, raw],
      });
      await send("Approving the confidential wrapper", {
        address: meta.underlying,
        abi: underlyingAbi,
        functionName: "approve",
        args: [meta.token, raw],
      });
      await send(`Shielding into confidential ${meta.symbol}`, {
        address: meta.token,
        abi: tokenAbi,
        functionName: "wrap",
        args: [address!, raw],
      });
    },
    deposit: async (units: bigint) => {
      await ensureOperator();
      const { handle, proof } = await encryptAmount(units);
      await send("Depositing (encrypted)", {
        address: meta.vault,
        abi: vaultAbi,
        functionName: "deposit",
        args: [handle, proof],
      });
    },
    withdraw: async (units: bigint) => {
      const { handle, proof } = await encryptAmount(units);
      await send("Withdrawing (encrypted)", {
        address: meta.vault,
        abi: vaultAbi,
        functionName: "withdraw",
        args: [handle, proof],
      });
    },
  };
}

/// Pool-level actions: sponsoring, running the draw, claiming the prize.
export function usePoolActions() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const send = useSend();

  return {
    /// Sponsor a vault's odds with verified plaintext: mint the prize token's
    /// underlying, approve the pool, and let the pool wrap it itself (§8.2a).
    contribute: async (vault: `0x${string}`, units: bigint) => {
      await send(`Minting test ${PRIZE_VAULT.underlyingSymbol}`, {
        address: PRIZE_VAULT.underlying,
        abi: underlyingAbi,
        functionName: "mint",
        args: [address!, units],
      });
      await send("Approving the prize pool", {
        address: PRIZE_VAULT.underlying,
        abi: underlyingAbi,
        functionName: "approve",
        args: [POOL_ADDRESS, units],
      });
      await send("Contributing to the vault's odds", {
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: "contribute",
        args: [vault, units],
      });
    },
    closeRound: async () => {
      await send("Closing round & drawing encrypted randomness", {
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: "closeRound",
      });
    },
    /// One-click demo yield: contribute test USDT to every populated vault, then
    /// close the overdue round — the same sequence the keeper runs on cron.
    fundAndDraw: async (vaultAddresses: `0x${string}`[], unitsEach: bigint) => {
      const total = unitsEach * BigInt(vaultAddresses.length);
      await send(`Minting test ${PRIZE_VAULT.underlyingSymbol}`, {
        address: PRIZE_VAULT.underlying,
        abi: underlyingAbi,
        functionName: "mint",
        args: [address!, total],
      });
      await send("Approving the prize pool", {
        address: PRIZE_VAULT.underlying,
        abi: underlyingAbi,
        functionName: "approve",
        args: [POOL_ADDRESS, total],
      });
      for (const vault of vaultAddresses) {
        await send("Contributing simulated yield", {
          address: POOL_ADDRESS,
          abi: poolAbi,
          functionName: "contribute",
          args: [vault, unitsEach],
        });
      }
      await send("Closing round & drawing encrypted randomness", {
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: "closeRound",
      });
    },
    /// One button per vault: begins its scan when needed, otherwise advances it.
    advanceVault: async (meta: VaultMeta) => {
      const [drawing, drawRound, roundId] = await Promise.all([
        publicClient!.readContract({ address: meta.vault, abi: vaultAbi, functionName: "drawing" }),
        publicClient!.readContract({ address: meta.vault, abi: vaultAbi, functionName: "drawRound" }),
        publicClient!.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: "roundId" }),
      ]);
      if (!drawing || drawRound !== roundId) {
        await send(`Starting the ${meta.symbol} vault scan`, {
          address: meta.vault,
          abi: vaultAbi,
          functionName: "beginDraw",
        });
      } else {
        await send(`Advancing the ${meta.symbol} scan (batch of ${BATCH_SIZE})`, {
          address: meta.vault,
          abi: vaultAbi,
          functionName: "advanceDraw",
          args: [BATCH_SIZE],
        });
      }
    },
    skipVault: async (vault: `0x${string}`) => {
      await send("Skipping the stalled vault", {
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: "skipVault",
        args: [vault],
      });
    },
    claim: async () => {
      await send("Claiming the encrypted prize", { address: POOL_ADDRESS, abi: poolAbi, functionName: "claim" });
    },
  };
}
