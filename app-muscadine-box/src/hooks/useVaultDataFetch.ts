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
    getVaultData,
    isLoading, 
    hasError 
  } = useVaultData();

  const fetchAllData = useCallback(async (vaultAddress: string, vaultChainId: number = chainId) => {
    if (!vaultAddress) return;

    try {
      // Use the unified fetchVaultData function which fetches all data in one call
      await fetchVaultData(vaultAddress, vaultChainId);
    } catch (error) {
      console.error('Error fetching vault data:', error);
    }
  }, [fetchVaultData, chainId]);

  useEffect(() => {
    if (autoFetch && vault) {
      fetchAllData(vault.address, vault.chainId);
    }
  }, [vault, autoFetch, fetchAllData]); // Include vault dependency

  return {
    vaultData: vault ? getVaultData(vault.address) : null,
    isLoading: vault ? isLoading(vault.address) : false,
    hasError: vault ? hasError(vault.address) : false,
    refetch: vault ? () => fetchAllData(vault.address, vault.chainId) : () => {},
  };
}

export function useVaultListPreloader(vaults: Vault[]) {
  const { preloadVaults } = useVaultData();
  
  useEffect(() => {
    if (vaults.length > 0) {
      preloadVaults(vaults);
    }
  }, [vaults, preloadVaults]); // Include vaults dependency
}
