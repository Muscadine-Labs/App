'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Vault, MorphoVaultData } from '../types/vault';

interface AllocationData {
  market?: {
    uniqueKey?: string; // Market unique key (market ID) needed for simulation
    loanAsset?: {
      address?: string;
      symbol?: string;
      name?: string;
    };
    collateralAsset?: {
      address?: string;
      symbol?: string;
      name?: string;
    };
  };
}

interface YieldData {
  [key: string]: unknown;
}

interface MetadataData {
  [key: string]: unknown;
  description?: string;
  curators?: Array<{ name?: string }>;
}

interface VaultDataState {
  [vaultAddress: string]: {
    basic: Vault | null;
    allocation: AllocationData[] | null;
    yield: YieldData | null;
    metadata: MetadataData | null;
    loading: boolean;
    error: string | null;
    lastFetched: number;
    isStale?: boolean;
  };
}

interface VaultDataContextType {
  vaultData: VaultDataState;
  fetchVaultData: (address: string, chainId?: number, forceRefresh?: boolean) => Promise<void>;
  getVaultData: (address: string) => MorphoVaultData | null;
  getVaultMarketIds: (address: string) => `0x${string}`[]; // Get market uniqueKeys for simulation
  isLoading: (address: string) => boolean;
  hasError: (address: string) => boolean;
  isStaleData: (address: string) => boolean;
  preloadVaults: (vaults: Vault[]) => Promise<void>;
}

const VaultDataContext = createContext<VaultDataContextType | undefined>(undefined);

interface VaultDataProviderProps {
  children: ReactNode;
}

// Constants moved outside component to avoid unnecessary re-renders
const CACHE_DURATION_VAULT_DATA = 5 * 60 * 1000; // 5 minutes
const MAX_PENDING_REQUESTS = 50; // Maximum pending requests before cleanup

export function VaultDataProvider({ children }: VaultDataProviderProps) {
  const [vaultData, setVaultData] = useState<VaultDataState>({});
  
  // Request deduplication maps with cleanup mechanism
  const pendingRequests = React.useRef<Map<string, Promise<void>>>(new Map());

  // Cleanup old pending requests periodically to prevent memory leaks
  React.useEffect(() => {
    const cleanup = setInterval(() => {
      if (pendingRequests.current.size > MAX_PENDING_REQUESTS) {
        // Remove oldest entries (FIFO - first in, first out)
        const entries = Array.from(pendingRequests.current.entries());
        const toRemove = entries.slice(0, entries.length - MAX_PENDING_REQUESTS);
        toRemove.forEach(([key]) => pendingRequests.current.delete(key));
      }
    }, 60000); // Run cleanup every minute

    return () => clearInterval(cleanup);
  }, []);

  const isDataStale = useCallback((timestamp: number) => {
    return Date.now() - timestamp > CACHE_DURATION_VAULT_DATA;
  }, []);

  // NEW: Fetch complete vault data in ONE API call
  const fetchCompleteVaultData = useCallback(async (address: string, chainId?: number, forceRefresh?: boolean) => {
    const effectiveChainId = chainId ?? 8453;
    const shouldForceRefresh = forceRefresh ?? false;
    const cacheKey = `vault-complete-${address}-${effectiveChainId}`;
    
    // Check if we already have fresh data (unless forcing refresh)
    if (!shouldForceRefresh && 
        vaultData[address] && 
        vaultData[address].basic && 
        !isDataStale(vaultData[address].lastFetched)) {
      return;
    }

    // Request deduplication
    if (pendingRequests.current.has(cacheKey)) {
      return pendingRequests.current.get(cacheKey);
    }

    const fetchPromise = (async () => {
      setVaultData(prev => ({
        ...prev,
        [address]: {
          ...prev[address],
          loading: true,
          error: null,
        }
      }));

      try {
        const response = await fetch(`/api/vaults/${address}/complete?chainId=${effectiveChainId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch complete vault data');
        }

        const vaultInfo = data.data.vaultByAddress;
        
        // Extract curator name from metadata
        const curatorAddress = vaultInfo.state?.curator;
        const curatorName = vaultInfo.metadata?.curators?.[0]?.name;
        
        const currentNetApy = vaultInfo.state?.netApy || 0;
        const netApyWithoutRewards = vaultInfo.state?.netApyWithoutRewards || 0;
        
        // Calculate rewards APR from the difference between netApy and netApyWithoutRewards
        // The rewards array might be empty if rewards are distributed indirectly
        const vaultRewards = vaultInfo.state?.rewards || [];
        const totalRewardsApr = currentNetApy - netApyWithoutRewards;
        const primaryRewardSymbol = vaultRewards.length > 0 
          ? vaultRewards[0]?.asset?.symbol || 'MORPHO'
          : 'MORPHO'; // Default to MORPHO since most rewards are in MORPHO token
        
        // Share price handling
        const rawSharePrice = vaultInfo.state?.sharePrice;
        const sharePriceUsd = vaultInfo.state?.sharePriceUsd;
        const formattedSharePrice = sharePriceUsd || (rawSharePrice ? rawSharePrice / 1e18 : 1);

        // Build the vault object
        const vault: Vault = {
          address: vaultInfo.address,
          name: vaultInfo.name || `Vault ${address.slice(0, 6)}...${address.slice(-4)}`,
          symbol: vaultInfo.asset?.symbol || 'UNKNOWN',
          chainId: chainId,
          totalValueLocked: vaultInfo.state?.totalAssetsUsd || 0,
          totalAssets: vaultInfo.state?.totalAssets || '0',
          assetDecimals: vaultInfo.asset?.decimals || 18,
          totalDeposits: vaultInfo.state?.totalAssetsUsd || 0,
          currentLiquidity: vaultInfo.state?.totalAssetsUsd || 0,
          sharePrice: formattedSharePrice,
          apy: vaultInfo.state?.netApy || 0,
          netApyWithoutRewards: netApyWithoutRewards,
          rewardsApr: totalRewardsApr,
          rewardSymbol: primaryRewardSymbol,
          whitelisted: vaultInfo.whitelisted ?? false,
          status: 'active',
          curator: curatorName || curatorAddress || 'Unknown Curator',
          curatorAddress: curatorAddress,
          guardianAddress: vaultInfo.state?.guardian,
          oracleAddress: vaultInfo.state?.allocation?.[0]?.market?.oracleAddress,
          ownerAddress: vaultInfo.state?.owner || '',
          allocators: vaultInfo.allocators?.map((alloc: { address: string }) => alloc.address) || [],
          performanceFee: (vaultInfo.state?.fee || 0) * 100,
          managementFee: 0,
          description: vaultInfo.metadata?.description || 'Morpho vault',
          allocatedMarkets: vaultInfo.state?.allocation?.map((alloc: AllocationData) => 
            `${alloc.market?.loanAsset?.symbol || alloc.market?.loanAsset?.name}/${alloc.market?.collateralAsset?.symbol || alloc.market?.collateralAsset?.name}`
          ) || [],
          // Extract unique market assets with their addresses for logo fetching
          marketAssets: (() => {
            const assetMap = new Map<string, { symbol: string; address?: string }>();
            
            vaultInfo.state?.allocation?.forEach((alloc: AllocationData) => {
              // Add loan asset
              if (alloc.market?.loanAsset?.symbol) {
                const symbol = alloc.market.loanAsset.symbol;
                if (!assetMap.has(symbol)) {
                  assetMap.set(symbol, {
                    symbol,
                    address: alloc.market.loanAsset.address,
                  });
                }
              }
              
              // Add collateral asset
              if (alloc.market?.collateralAsset?.symbol) {
                const symbol = alloc.market.collateralAsset.symbol;
                if (!assetMap.has(symbol)) {
                  assetMap.set(symbol, {
                    symbol,
                    address: alloc.market.collateralAsset.address,
                  });
                }
              }
            });
            
            return Array.from(assetMap.values());
          })(),
          timelockDuration: vaultInfo.state?.timelock || 0,
          lastUpdated: new Date().toISOString(),
        };

        setVaultData(prev => ({
          ...prev,
          [address]: {
            basic: vault,
            allocation: vaultInfo.state?.allocation || null,
            yield: vaultInfo as YieldData,
            metadata: vaultInfo.metadata as MetadataData,
            loading: false,
            error: null,
            lastFetched: Date.now(),
          }
        }));

      } catch (error) {
        setVaultData(prev => ({
          ...prev,
          [address]: {
            ...prev[address],
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }));
      } finally {
        pendingRequests.current.delete(cacheKey);
      }
    })();

    pendingRequests.current.set(cacheKey, fetchPromise);
    return fetchPromise;
  }, [vaultData, isDataStale]);



  const getVaultData = useCallback((address: string): MorphoVaultData | null => {
    const data = vaultData[address];
    if (!data?.basic) return null;

    // Combine all data sources into MorphoVaultData format
    const basic = data.basic;


    return {
      ...basic,
      totalValueLocked: basic.totalValueLocked || 0,
      apy: basic.apy || 0, // Use the correct netApy value from basic
      netApyWithoutRewards: basic.netApyWithoutRewards || 0,
      rewardsApr: basic.rewardsApr || 0,
      rewardSymbol: basic.rewardSymbol || '',
      apyChange: 0,
      totalDeposits: basic.totalDeposits || 0,
      currentLiquidity: basic.currentLiquidity || 0,
      sharePrice: basic.sharePrice || 1,
      whitelisted: basic.whitelisted ?? false,
      timelockDuration: basic.timelockDuration || 0,
      guardianAddress: basic.guardianAddress || '',
      oracleAddress: basic.oracleAddress || '',
      ownerAddress: basic.ownerAddress || '',
      allocators: basic.allocators || [],
      allocatedMarkets: basic.allocatedMarkets || [],
      status: basic.status || 'active',
      curator: basic.curator || 'Morpho Labs',
      curatorAddress: basic.curatorAddress || '',
      performanceFee: basic.performanceFee || 0.0,
      managementFee: basic.managementFee || 0.0,
      description: basic.description || 'High-yield lending vault optimized for stablecoin deposits with automated market allocation.',
    };
  }, [vaultData]);

  const isLoading = useCallback((address: string) => {
    return vaultData[address]?.loading || false;
  }, [vaultData]);

  const hasError = useCallback((address: string) => {
    return !!vaultData[address]?.error;
  }, [vaultData]);

  const isStaleData = useCallback((address: string) => {
    const data = vaultData[address];
    if (!data) return false;
    return isDataStale(data.lastFetched);
  }, [vaultData, isDataStale]);

  const preloadVaults = useCallback(async (vaults: Vault[]) => {
    // Preload complete vault data for all vaults in parallel (maximum efficiency)
    // Promise.allSettled allows all requests to complete even if some fail
    const promises = vaults.map(vault => 
      fetchCompleteVaultData(vault.address, vault.chainId)
    );
    
    await Promise.allSettled(promises);
  }, [fetchCompleteVaultData]);

  // Extract market uniqueKeys from vault allocation data for simulation state
  const getVaultMarketIds = useCallback((address: string): `0x${string}`[] => {
    const data = vaultData[address];
    if (!data?.allocation || !Array.isArray(data.allocation)) {
      return [];
    }
    
    return data.allocation
      .map((alloc: AllocationData) => alloc?.market?.uniqueKey)
      .filter((uniqueKey: string | undefined): uniqueKey is string => !!uniqueKey)
      .filter((key: string) => key.startsWith('0x')) as `0x${string}`[];
  }, [vaultData]);

  const value: VaultDataContextType = {
    vaultData,
    fetchVaultData: fetchCompleteVaultData,
    getVaultData,
    getVaultMarketIds,
    isLoading,
    hasError,
    isStaleData,
    preloadVaults,
  };

  return (
    <VaultDataContext.Provider value={value}>
      {children}
    </VaultDataContext.Provider>
  );
}

export function useVaultData() {
  const context = useContext(VaultDataContext);
  if (context === undefined) {
    throw new Error('useVaultData must be used within a VaultDataProvider');
  }
  return context;
}
