import { useMemo } from "react";
import { useBlock, useAccount, useReadContract, useReadContracts, useWalletClient } from "wagmi";
import {
  getChainAddresses,
  NATIVE_ADDRESS,
  MarketParams,
  type MarketId,
} from "@morpho-org/blue-sdk";
import {
  useSimulationState,
} from "@morpho-org/simulation-sdk-wagmi";
import { ReadContractErrorType, type Address } from "viem";
import { useVaultData } from "../contexts/VaultDataContext";

const BASE_CHAIN_ID = 8453;

// Extended ABI to include Withdrawal Queue functions
const VAULT_ABI_EXTENDED = [
  {
    inputs: [],
    name: "asset",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawQueueLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "withdrawQueue",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const getSimulationErrorMessage = (
  error: any
): string | null => {
  if (!error) return null;
  if (error instanceof Error) return error.message;

  const errorKeys = [
    "global", "markets", "users", "tokens", "vaults",
    "positions", "holdings", "vaultMarketConfigs", "vaultUsers",
  ];

  const hasRealError = errorKeys.some((key) => {
    if (key === "global") {
      const feeRecipient = error.global?.feeRecipient;
      if (feeRecipient == null) return false;
      return (
        feeRecipient instanceof Error ||
        (typeof feeRecipient === "object" && Object.keys(feeRecipient).length > 0)
      );
    }
    const value = error[key];
    if (value == null) return false;
    if (value instanceof Error) return true;
    if (typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) return false;
      return keys.some((k) => value[k] instanceof Error);
    }
    return false;
  });

  return hasRealError ? JSON.stringify(error, null, 2) : null;
};

export const useVaultSimulationState = (
  vaultAddress?: string,
  enabled: boolean = true
) => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const vaultDataContext = useVaultData();
  const shouldFetch = enabled && !!vaultAddress && !!address;

  const { data: block } = useBlock({
    chainId: BASE_CHAIN_ID,
    watch: shouldFetch,
    query: {
      enabled: shouldFetch,
      refetchInterval: 12000,
    },
  });

  const { data: assetAddress, isLoading: isAssetLoading } = useReadContract({
    address: vaultAddress as Address,
    abi: VAULT_ABI_EXTENDED,
    functionName: "asset",
    chainId: BASE_CHAIN_ID,
    query: { enabled: shouldFetch },
  });

  const { data: queueLength, isLoading: isLengthLoading } = useReadContract({
    address: vaultAddress as Address,
    abi: VAULT_ABI_EXTENDED,
    functionName: "withdrawQueueLength",
    chainId: BASE_CHAIN_ID,
    query: { enabled: shouldFetch },
  });

  const queueCalls = useMemo(() => {
    if (!queueLength || !vaultAddress) return [];
    const count = Number(queueLength);
    const safeCount = Math.min(count, 30);
    
    return Array.from({ length: safeCount }).map((_, i) => ({
      address: vaultAddress as Address,
      abi: VAULT_ABI_EXTENDED,
      functionName: "withdrawQueue",
      args: [BigInt(i)],
      chainId: BASE_CHAIN_ID,
    }));
  }, [queueLength, vaultAddress]);

  const { data: queueMarkets, isLoading: isQueueLoading } = useReadContracts({
    contracts: queueCalls,
    query: { enabled: queueCalls.length > 0 && shouldFetch },
  });

  // Get market IDs from vault allocation data (preferred) or queue markets (fallback)
  const marketIds = useMemo(() => {
    if (!vaultAddress) return [];
    
    // Try to get market IDs from vault data context first
    const contextMarketIds = vaultDataContext.getVaultMarketIds(vaultAddress);
    if (contextMarketIds.length > 0) {
      return contextMarketIds as MarketId[];
    }
    
    // Fallback to queue markets
    const activeMarketIds: MarketId[] = [];
    if (queueMarkets) {
      queueMarkets.forEach((res) => {
        if (res.result) {
          const mId = res.result as MarketId;
          activeMarketIds.push(mId);
        }
      });
    }
    return activeMarketIds;
  }, [vaultAddress, queueMarkets, vaultDataContext]);

  // Build tokens list: vault asset + vault address (shares) + native token + WETH + market tokens
  const tokens = useMemo(() => {
    const activeTokens = new Set<string>([NATIVE_ADDRESS]);
    
    // Base WETH address - needed for ETH wrapping/unwrapping operations
    const BASE_WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
    activeTokens.add(BASE_WETH_ADDRESS);
    
    if (assetAddress) activeTokens.add(assetAddress);
    
    // CRITICAL: The vault itself is a token (shares). Must include it.
    if (vaultAddress) activeTokens.add(vaultAddress);

    // Add tokens from markets
    marketIds.forEach((mId) => {
      try {
        const params = MarketParams.get(mId);
        if (params.collateralToken) {
          activeTokens.add(params.collateralToken);
        }
        if (params.loanToken) {
          activeTokens.add(params.loanToken);
        }
      } catch (e) {
        // Silently ignore unknown markets
      }
    });

    return Array.from(activeTokens);
  }, [assetAddress, vaultAddress, marketIds]);

  const bundler = useMemo(() => {
    const chainAddresses = getChainAddresses(BASE_CHAIN_ID);
    return chainAddresses?.bundler3?.bundler3;
  }, []);

  // CRITICAL: For v1 vaults with bundler 3, populateBundle uses generalAdapter1 internally
  // We must include it in the users list so the simulation state can access vaults for it
  const generalAdapter = useMemo(() => {
    try {
      const chainAddresses = getChainAddresses(BASE_CHAIN_ID);
      // Get generalAdapter1 from bundler3 configuration (for v1 vaults)
      return chainAddresses?.bundler3?.generalAdapter1 || 
             '0xb98c948CFA24072e58935BC004a8A7b376AE746A'; // Known adapter address for Base
    } catch {
      return '0xb98c948CFA24072e58935BC004a8A7b376AE746A'; // Fallback to known address
    }
  }, []);

  const users = useMemo(() => {
    const list: string[] = [];
    if (address) list.push(address);
    if (bundler) list.push(bundler);
    
    // Include generalAdapter
    if (generalAdapter) {
      const normalizedAdapter = generalAdapter.toLowerCase();
      if (!list.some(addr => addr.toLowerCase() === normalizedAdapter)) {
        list.push(generalAdapter);
      }
    }

    // Vault is also a user (supply positions in Blue)
    if (vaultAddress) list.push(vaultAddress);

    // FIX: Add the assetAddress to users. 
    // This ensures the simulation can execute contract interactions (like wrapping) on the asset itself.
    if (assetAddress && !list.includes(assetAddress)) {
        list.push(assetAddress);
    }

    return list;
  }, [address, bundler, generalAdapter, vaultAddress, assetAddress]);

  const vaults = useMemo(() => {
    return vaultAddress ? [vaultAddress] : [];
  }, [vaultAddress]);

  const isDataReady =
    shouldFetch &&
    !!address &&
    !!assetAddress &&
    !isLengthLoading &&
    !isQueueLoading;

  const simulation = useSimulationState({
    marketIds: marketIds as MarketId[],
    users: users as `0x${string}`[],
    tokens: tokens as `0x${string}`[],
    vaults: vaults as `0x${string}`[],
    vaultV2s: [],
    vaultV2Adapters: [],
    block: block
      ? {
          number: block.number,
          timestamp: block.timestamp,
        }
      : undefined,
    query: {
      enabled: isDataReady,
      refetchInterval: false,
      staleTime: 30000,
    },
  });

  const errorMessage = getSimulationErrorMessage(simulation.error);

  return {
    simulationState: simulation.data,
    isPending: isLengthLoading || isQueueLoading || isAssetLoading || simulation.isPending,
    error: errorMessage,
    bundler,
    config: {
      users,
      tokens,
      vaults,
      marketIds,
    },
  };
};

