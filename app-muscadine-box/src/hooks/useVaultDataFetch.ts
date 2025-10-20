import { useEffect, useCallback } from 'react';
import { useVaultData } from '../contexts/VaultDataContext';
import { Vault } from '../types/vault';

interface UseVaultDataFetchOptions {
  autoFetch?: boolean;
  chainId?: number;
}

export function useVaultDataFetch(vault: Vault | null, options: UseVaultDataFetchOptions = {}) {
  const { autoFetch = true, chainId = 8453 } = options;
  const { 
    fetchVaultData, 
    fetchVaultAllocation, 
    fetchVaultYield,
    fetchVaultMetadata,
    getVaultData,
    isLoading, 
    hasError 
  } = useVaultData();

  const fetchAllData = useCallback(async (vaultAddress: string, vaultChainId: number = chainId) => {
    if (!vaultAddress) return;

    try {
      // Fetch all data in parallel for better performance
      await Promise.allSettled([
        fetchVaultData(vaultAddress, vaultChainId),
        fetchVaultAllocation(vaultAddress, vaultChainId),
        fetchVaultYield(vaultAddress, vaultChainId),
        fetchVaultMetadata(vaultAddress, vaultChainId),
      ]);
    } catch (error) {
      console.error('Error fetching vault data:', error);
    }
  }, [fetchVaultData, fetchVaultAllocation, fetchVaultYield, fetchVaultMetadata, chainId]);

  useEffect(() => {
    if (autoFetch && vault) {
      fetchAllData(vault.address, vault.chainId);
    }
  }, [vault?.address, vault?.chainId, autoFetch, fetchAllData]); // Include fetchAllData dependency

  return {
    vaultData: vault ? getVaultData(vault.address) : null,
    isLoading: vault ? isLoading(vault.address) : false,
    hasError: vault ? hasError(vault.address) : false,
    refetch: vault ? () => fetchAllData(vault.address, vault.chainId) : () => {},
  };
}

export function useVaultListPreloader(vaults: Vault[]) {
  const { preloadVaults } = useVaultData();

  // Create a stable reference to vault addresses
  const vaultAddresses = vaults.map(v => v.address).sort().join(',');
  
  useEffect(() => {
    if (vaults.length > 0) {
      preloadVaults(vaults);
    }
  }, [vaultAddresses, preloadVaults]); // Include preloadVaults dependency
}
