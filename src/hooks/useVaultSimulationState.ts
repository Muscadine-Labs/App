import { useMemo, useCallback } from "react";
import { useBlock, useAccount, useReadContract, useReadContracts, useBalance } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  getChainAddresses,
  NATIVE_ADDRESS,
  MarketParams,
  Holding,
  type MarketId,
} from "@morpho-org/blue-sdk";
import {
  useSimulationState,
} from "@morpho-org/simulation-sdk-wagmi";
import { type Address } from "viem";
import { useVaultData } from "../contexts/VaultDataContext";
import { BASE_CHAIN_ID, BASE_WETH_ADDRESS, GENERAL_ADAPTER_ADDRESS, MAX_WITHDRAW_QUEUE_ITEMS } from "../lib/constants";

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

interface SimulationError {
  global?: {
    feeRecipient?: Error | Record<string, unknown>;
  };
  markets?: Record<string, Error | Record<string, unknown>>;
  users?: Record<string, Error | Record<string, unknown>>;
  tokens?: Record<string, Error | Record<string, unknown>>;
  vaults?: Record<string, Error | Record<string, unknown>>;
  positions?: Record<string, Error | Record<string, unknown>>;
  holdings?: Record<string, Error | Record<string, unknown>>;
  vaultMarketConfigs?: Record<string, Error | Record<string, unknown>>;
  vaultUsers?: Record<string, Error | Record<string, unknown>>;
}

const getSimulationErrorMessage = (
  error: SimulationError | Error | null | undefined
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
    const value = (error as Record<string, unknown>)[key];
    if (value == null) return false;
    if (value instanceof Error) return true;
    if (typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) return false;
      return keys.some((k) => (value as Record<string, unknown>)[k] instanceof Error);
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
  const vaultDataContext = useVaultData();
  const queryClient = useQueryClient();
  const shouldFetch = enabled && !!vaultAddress && !!address;

  // Fetch native ETH balance to ensure it's available for wrapping
  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: address as Address,
    chainId: BASE_CHAIN_ID,
    query: {
      enabled: shouldFetch,
    },
  });

  // Only watch block when simulation is actively needed (e.g., modal is open)
  // Disable watch to reduce RPC calls - block will be fetched once per render
  const { data: block, refetch: refetchBlock } = useBlock({
    chainId: BASE_CHAIN_ID,
    watch: false, // Disable continuous watching to reduce RPC calls
    query: {
      enabled: shouldFetch,
      refetchInterval: false, // Disable polling - only fetch when needed
      staleTime: 0, // Always fetch fresh block before transactions
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
    const safeCount = Math.min(count, MAX_WITHDRAW_QUEUE_ITEMS);
    
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
      } catch {
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
      return chainAddresses?.bundler3?.generalAdapter1 || GENERAL_ADAPTER_ADDRESS;
    } catch {
      return GENERAL_ADAPTER_ADDRESS; // Fallback to known address
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

    // Note: assetAddress doesn't need to be a user - it's just a token address
    // Removing it to reduce RPC calls

    return list;
  }, [address, bundler, generalAdapter, vaultAddress]);

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
      refetchInterval: false, // Disable automatic refetching
      staleTime: 0, // Always fetch fresh simulation state before transactions
    },
  });

  const errorMessage = getSimulationErrorMessage(
    simulation.error as SimulationError | Error | null | undefined
  );

  // Helper function to enhance simulation state with native ETH balance
  // This can be called outside the hook to enhance fresh refetched data
  const enhanceSimulationStateWithNativeBalance = useCallback((
    simData: typeof simulation.data,
    userAddress: Address | undefined,
    ethBalance: typeof nativeBalance
  ) => {
    if (!simData || !userAddress) {
      return simData;
    }

    if (!ethBalance) {
      return simData;
    }

    // Create a new object with the same prototype to preserve methods
    const state = Object.create(Object.getPrototypeOf(simData));
    Object.assign(state, simData);
    
    // Ensure holdings object exists
    if (!state.holdings) {
      state.holdings = {};
    }
    
    // Ensure user's holdings object exists
    if (!state.holdings[userAddress]) {
      state.holdings[userAddress] = {};
    }
    
    // Always update native balance to ensure bundler sees it for wrapping
    const userHoldings = state.holdings[userAddress];
    const nativeAddress = NATIVE_ADDRESS as `0x${string}`;
    
    // Always update/create the native holding with the current balance
    const existing = userHoldings[nativeAddress];
    userHoldings[nativeAddress] = new Holding({
      user: userAddress,
      token: nativeAddress,
      balance: ethBalance.value,
      erc20Allowances: existing?.erc20Allowances || {
        morpho: BigInt(0),
        permit2: BigInt(0),
        'bundler3.generalAdapter1': BigInt(0),
      },
      permit2BundlerAllowance: existing?.permit2BundlerAllowance || { amount: BigInt(0), expiration: BigInt(0), nonce: BigInt(0) },
      erc2612Nonce: existing?.erc2612Nonce || BigInt(0),
      canTransfer: existing?.canTransfer !== false,
    });
    
    return state;
  }, [simulation]);

  // Manually ensure native ETH balance is in holdings if simulation state exists
  const enhancedSimulationState = useMemo(() => {
    return enhanceSimulationStateWithNativeBalance(simulation.data, address, nativeBalance);
  }, [simulation.data, address, nativeBalance, enhanceSimulationStateWithNativeBalance]);

  return {
    simulationState: enhancedSimulationState,
    isPending: isLengthLoading || isQueueLoading || isAssetLoading || simulation.isPending,
    error: errorMessage,
    bundler,
    refetch: async () => {
      // Refetch block first to ensure we have the latest block
      await refetchBlock();
      
      // Refetch native balance to get fresh ETH balance
      const nativeBalanceResult = await refetchNativeBalance();
      
      // Try to access refetch method directly (may not be in types but exists at runtime)
      // React Query hooks typically expose refetch that returns { data, error }
      let freshSimulationData = simulation.data;
      
      if ('refetch' in simulation && typeof (simulation as any).refetch === 'function') {
        try {
          const result = await (simulation as any).refetch();
          if (result?.data) {
            freshSimulationData = result.data;
          }
        } catch {
          // If refetch fails, use current data
        }
      } else {
        // Fallback: invalidate query and wait for refetch
        // The simulation will auto-refetch when block changes (staleTime: 0)
        await queryClient.invalidateQueries({
          predicate: (query) => {
            // Match simulation-related queries
            const key = query.queryKey;
            return Array.isArray(key) && key.some(k => 
              typeof k === 'string' && (k.includes('simulation') || k.includes('Simulation'))
            );
          },
        });
        // Wait for refetch to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        freshSimulationData = simulation.data;
      }
      
      // Enhance the fresh simulation state with native balance and return it
      return enhanceSimulationStateWithNativeBalance(
        freshSimulationData,
        address,
        nativeBalanceResult.data || nativeBalance
      );
    },
    config: {
      users,
      tokens,
      vaults,
      marketIds,
    },
  };
};

