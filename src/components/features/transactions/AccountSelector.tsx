'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Account, WalletAccount, VaultAccount, getVaultLogo } from '@/types/vault';
import { useWallet } from '@/contexts/WalletContext';
import { useVaultData } from '@/contexts/VaultDataContext';
import { VAULTS } from '@/lib/vaults';
import { formatUnits } from 'viem';
import { formatAssetBalance, truncateAddress } from '@/lib/formatter';
import { useOnClickOutside } from '@/hooks/onClickOutside';
import { useAccount } from 'wagmi';
import { Icon } from '@/components/ui/Icon';

interface AccountSelectorProps {
  label: string;
  selectedAccount: Account | null;
  onSelect: (account: Account | null) => void;
  excludeAccount?: Account | null; // Account to exclude (e.g., exclude "from" when selecting "to")
  filterByAssetSymbol?: string | null; // Filter accounts by asset symbol (for compatibility)
  assetSymbol?: string | null; // Asset symbol for displaying wallet balance
}

export function AccountSelector({
  label,
  selectedAccount,
  onSelect,
  excludeAccount,
  filterByAssetSymbol,
  assetSymbol,
}: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { address } = useAccount();
  const { tokenBalances, ethBalance, morphoHoldings } = useWallet();
  const { getVaultData, fetchVaultData } = useVaultData();
  const hasPreloadedRef = useRef(false);

  useOnClickOutside(dropdownRef, () => setIsOpen(false));

  // Preload vault data for all vaults when component mounts (only once)
  useEffect(() => {
    if (hasPreloadedRef.current) return;
    
    const preloadAllVaults = async () => {
      const vaultsToPreload = Object.values(VAULTS);
      
      // Fetch vault data for all vaults in parallel
      await Promise.allSettled(
        vaultsToPreload.map(vault => fetchVaultData(vault.address, vault.chainId))
      );
      hasPreloadedRef.current = true;
    };
    
    preloadAllVaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - fetchVaultData is stable enough for this use case

  // Build wallet account - single wallet account (not per-token)
  // Wallet should always be shown because:
  // 1. If no filter: showing all accounts (wallet should be available)
  // 2. If filter is set: "from" is a vault, so wallet should be available as withdrawal destination
  //    (user doesn't need to already have the token - they're withdrawing TO wallet)
  const walletAccounts: WalletAccount[] = [];
  
  // Always show wallet (filter is only used to filter vaults, not wallet availability)
  walletAccounts.push({
    type: 'wallet',
    address: 'wallet',
    symbol: 'Wallet', // Generic symbol for wallet
    balance: BigInt(0), // Balance will be calculated based on selected asset
  });

  // Build vault account options - filter by asset symbol if provided
  // Always show at least some vaults (if no filter, show all; if filter, show matching)
  const vaultAccounts: VaultAccount[] = Object.values(VAULTS)
    .filter((vault) => {
      // If filter is set, only include vaults with matching asset symbol
      if (filterByAssetSymbol) {
        return vault.symbol.toUpperCase() === filterByAssetSymbol.toUpperCase();
      }
      return true; // Show all vaults if no filter
    })
    .map((vault): VaultAccount => {
      const vaultData = getVaultData(vault.address);
      const position = morphoHoldings.positions.find(
        (pos) => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
      );

      // Calculate user's withdrawable balance (in assets, not shares)
      let balance = BigInt(0);
      if (position && vaultData) {
        const shares = BigInt(position.shares);
        // For now, use shares directly - will be converted to assets during transaction
        balance = shares;
      }

      return {
        type: 'vault' as const,
        address: vault.address,
        name: vault.name,
        symbol: vault.symbol,
        balance,
        assetAddress: '', // Will be fetched from vault contract during transaction
        assetDecimals: vaultData?.assetDecimals ?? 18,
      };
    });

  // Filter accounts based on compatibility
  // Prevent vault-to-vault transactions: if excludeAccount is a vault, only show wallet
  // If excludeAccount is a wallet, show all vaults and wallet
  const availableAccounts = [...walletAccounts, ...vaultAccounts].filter((account) => {
    if (!excludeAccount) {
      return true;
    }
    
    // Exclude the same account if it's already selected in the other field
    if (account.type === 'wallet' && excludeAccount.type === 'wallet') {
      return false;
    }
    if (account.type === 'vault' && excludeAccount.type === 'vault') {
      const accountVault = account as VaultAccount;
      const excludeVault = excludeAccount as VaultAccount;
      if (accountVault.address.toLowerCase() === excludeVault.address.toLowerCase()) {
        return false;
      }
    }
    
    // If the other account is a vault, only allow wallet (prevent vault-to-vault)
    if (excludeAccount.type === 'vault') {
      return account.type === 'wallet';
    }
    
    // Wallet is always available (parent will handle unselecting from other slot)
    return true;
  });

  // Calculate balance value (returns number or null)
  const getBalanceValue = (account: Account, assetSymbol?: string): { value: number; symbol: string; decimals?: number } | null => {
    if (account.type === 'wallet') {
      if (assetSymbol) {
        if (assetSymbol === 'WETH' || assetSymbol === 'ETH') {
          const value = parseFloat(ethBalance || '0');
          return { value, symbol: assetSymbol };
        }
        const token = tokenBalances.find((t) => t.symbol.toUpperCase() === assetSymbol.toUpperCase());
        if (token) {
          const decimals = token.decimals;
          const balanceString = formatUnits(token.balance, decimals);
          const value = parseFloat(balanceString);
          return { value, symbol: assetSymbol, decimals };
        }
        return null;
      }
      const value = parseFloat(ethBalance || '0');
      return { value, symbol: 'ETH' };
    } else {
      const vaultAccount = account as VaultAccount;
      const vaultData = getVaultData(vaultAccount.address);
      const position = morphoHoldings.positions.find(
        (pos) => pos.vault.address.toLowerCase() === vaultAccount.address.toLowerCase()
      );

      if (!position || !vaultData) {
        return null;
      }

      // First priority: Use position.assets if available (from GraphQL)
      if (position.assets) {
        const value = parseFloat(position.assets) / Math.pow(10, vaultData.assetDecimals || 18);
        return { value, symbol: vaultAccount.symbol, decimals: vaultData.assetDecimals };
      }
      
      // Second priority: Calculate from shares using share price
      const sharesDecimal = parseFloat(position.shares) / 1e18;
      
      if (vaultData.sharePrice && sharesDecimal > 0) {
        const value = sharesDecimal * vaultData.sharePrice;
        return { value, symbol: vaultAccount.symbol, decimals: vaultData.assetDecimals };
      }
      
      // Third priority: Calculate share price from totalAssets / totalSupply
      if (position.vault?.state?.totalSupply && vaultData.totalAssets) {
        const totalSupplyDecimal = parseFloat(position.vault.state.totalSupply) / 1e18;
        const totalAssetsDecimal = parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18);
        
        if (totalSupplyDecimal > 0) {
          const sharePriceInAsset = totalAssetsDecimal / totalSupplyDecimal;
          const value = sharesDecimal * sharePriceInAsset;
          return { value, symbol: vaultAccount.symbol, decimals: vaultData.assetDecimals };
        }
      }
      
      return null;
    }
  };

  // Format balance using formatter.ts directly
  const formatBalance = (account: Account, assetSymbol?: string): string => {
    const balanceData = getBalanceValue(account, assetSymbol);
    if (!balanceData) {
      const symbol = account.type === 'wallet' 
        ? (assetSymbol || 'ETH')
        : (account as VaultAccount).symbol;
      return formatAssetBalance(0, symbol);
    }
    return formatAssetBalance(balanceData.value, balanceData.symbol, balanceData.decimals);
  };

  const getAccountDisplayName = (account: Account): string => {
    if (account.type === 'wallet') {
      return address ? `Wallet ${truncateAddress(address)}` : 'Wallet';
    } else {
      const vaultAccount = account as VaultAccount;
      return vaultAccount.name;
    }
  };

  const getAccountLogo = (account: Account): string | null => {
    if (account.type === 'wallet') {
      // Use asset symbol logo if available, otherwise return null for blank circle
      if (assetSymbol) {
        return getVaultLogo(assetSymbol);
      }
      return null; // Return null to show blank circle
    } else {
      return getVaultLogo(account.symbol);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-2">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-subtle)] rounded-lg text-left flex items-center justify-between hover:border-[var(--primary)] transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedAccount ? (
            <>
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border border-[var(--border-subtle)]">
                {getAccountLogo(selectedAccount) ? (
                  <Image
                    src={getAccountLogo(selectedAccount)!}
                    alt={getAccountDisplayName(selectedAccount)}
                    width={32}
                    height={32}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Icon name="wallet" size="md" color="secondary" className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--foreground)] truncate">
                  {getAccountDisplayName(selectedAccount)}
                </div>
                <div className="text-xs text-[var(--foreground-secondary)]">
                  {formatBalance(selectedAccount, assetSymbol || undefined)}
                </div>
              </div>
            </>
          ) : (
            <span className="text-[var(--foreground-muted)]">Select account</span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-[var(--foreground-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {availableAccounts.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--foreground-secondary)]">
              No accounts available
            </div>
          ) : (
            availableAccounts.map((account, index) => {
              const isSelected = selectedAccount && 
                account.type === selectedAccount.type &&
                (account.type === 'wallet' || 
                 (account.type === 'vault' && 
                  (account as VaultAccount).address.toLowerCase() === 
                  (selectedAccount as VaultAccount).address.toLowerCase()));

              return (
                <button
                  key={`${account.type}-${account.type === 'vault' ? (account as VaultAccount).address : account.symbol}-${index}`}
                  type="button"
                  onClick={() => {
                    onSelect(account);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--background)] transition-colors ${
                    isSelected ? 'bg-[var(--background)]' : ''
                  } ${index > 0 ? 'border-t border-[var(--border-subtle)]' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border border-[var(--border-subtle)]">
                    {getAccountLogo(account) ? (
                      <Image
                        src={getAccountLogo(account)!}
                        alt={getAccountDisplayName(account)}
                        width={32}
                        height={32}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Icon name="wallet" size="md" color="secondary" className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-[var(--foreground)] truncate">
                      {getAccountDisplayName(account)}
                    </div>
                    <div className="text-xs text-[var(--foreground-secondary)]">
                      {formatBalance(account, assetSymbol || undefined)}
                    </div>
                  </div>
                  {isSelected && (
                    <svg
                      className="w-5 h-5 text-[var(--primary)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

