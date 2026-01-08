'use client';

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { AccountSelector, TransactionFlow, TransactionProgressBar } from '@/components/features/transactions';
import { useTransactionState } from '@/contexts/TransactionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useVaultData } from '@/contexts/VaultDataContext';
import { usePrices } from '@/contexts/PriceContext';
import { useVaultVersion } from '@/contexts/VaultVersionContext';
import { VAULTS } from '@/lib/vaults';
import { VaultAccount, WalletAccount } from '@/types/vault';
import { formatBigIntForInput, formatAvailableBalance, formatAssetAmountForMax, formatCurrency, formatAssetBalance } from '@/lib/formatter';
import { Button } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { formatUnits } from 'viem';
import { ERC4626_ABI } from '@/lib/abis';

// Helper function to get asset decimals from vault symbol (no API needed)
const getAssetDecimals = (symbol: string): number => {
  if (symbol === 'USDC') {
    return 6;
  }
  if (symbol === 'cbBTC' || symbol === 'BTC' || symbol === 'CBBTC') {
    return 8;
  }
  if (symbol === 'WETH' || symbol === 'ETH') {
    return 18;
  }
  return 18; // Default to 18 for other tokens
};

type TransactionTab = 'deposit' | 'withdraw';

export default function TransactionsPage() {
  const { isConnected } = useAccount();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tokenBalances, ethBalance, morphoHoldings, refreshBalances } = useWallet();
  const { fetchVaultData } = useVaultData();
  const { btc: btcPrice, eth: ethPrice } = usePrices();
  const { version } = useVaultVersion();
  const {
    fromAccount,
    toAccount,
    amount,
    status,
    derivedAsset,
    preferredAsset,
    setFromAccount,
    setToAccount,
    setAmount,
    setStatus,
    setPreferredAsset,
    reset,
  } = useTransactionState();
  
  // Tab state - determine from URL params or default to deposit
  const [activeTab, setActiveTab] = useState<TransactionTab>(() => {
    const action = searchParams.get('action');
    return action === 'withdraw' ? 'withdraw' : 'deposit';
  });

  // Refresh wallet and vault data when page opens
  useEffect(() => {
    if (isConnected) {
      // Refresh wallet balances immediately (includes vault positions via RPC)
      refreshBalances();
      
      // Refresh vault data for all vaults that the user has positions in (force refresh to bypass cache)
      const vaultsToRefresh = morphoHoldings.positions.map(pos => pos.vault.address);
      vaultsToRefresh.forEach(vaultAddress => {
        fetchVaultData(vaultAddress, 8453, true); // Force refresh
      });
      
      // Also refresh all available vaults to ensure we have fresh data for selection
      Object.values(VAULTS).forEach(vault => {
        fetchVaultData(vault.address, vault.chainId, true); // Force refresh
      });
    }
    // Only run once when component mounts or when connection status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Track previous status to detect transitions to idle
  const prevStatusRef = useRef<typeof status>(status);
  
  // Refresh balances when status returns to idle (after transaction completion/reset)
  useEffect(() => {
    // Only refresh when transitioning TO idle from another state (not on initial mount)
    const wasIdle = prevStatusRef.current === 'idle';
    const isNowIdle = status === 'idle';
    const transitionedToIdle = !wasIdle && isNowIdle;
    
    if (isConnected && transitionedToIdle) {
      // Refresh wallet balances to get updated values (includes vault positions via RPC)
      refreshBalances();
      
      // Refresh vault data for all vaults that the user has positions in (force refresh to bypass cache)
      const vaultsToRefresh = morphoHoldings.positions.map(pos => pos.vault.address);
      vaultsToRefresh.forEach(vaultAddress => {
        fetchVaultData(vaultAddress, 8453, true); // Force refresh
      });
      
      // Also refresh all available vaults to ensure we have fresh data for selection
      Object.values(VAULTS).forEach(vault => {
        fetchVaultData(vault.address, vault.chainId, true); // Force refresh
      });
    }
    
    // Update previous status
    prevStatusRef.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isConnected]);

  // Handle URL params for pre-filling vault (when navigating from vault page)
  useEffect(() => {
    const vaultAddress = searchParams.get('vault');
    const action = searchParams.get('action'); // 'deposit' or 'withdraw'

    if (action) {
      setActiveTab(action === 'withdraw' ? 'withdraw' : 'deposit');
    }

    if (vaultAddress && action) {
      const vault = Object.values(VAULTS).find((v) => 
        v.address.toLowerCase() === vaultAddress.toLowerCase() && (version === 'all' || v.version === version)
      );
      if (vault) {
        const position = morphoHoldings.positions.find(
          (pos) => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
        );

        const vaultAccount: VaultAccount = {
          type: 'vault',
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          balance: position ? BigInt(position.shares) : BigInt(0),
          assetAddress: '', // Will be fetched during transaction
          assetDecimals: getAssetDecimals(vault.symbol),
        };

        if (action === 'deposit') {
          // Pre-fill wallet as "from" and vault as "to"
          const walletAccount: WalletAccount = {
            type: 'wallet',
            address: 'wallet',
            symbol: vault.symbol,
            balance: BigInt(0),
          };
          setFromAccount(walletAccount);
          setToAccount(vaultAccount);
          // Set default preferredAsset to 'ALL' for WETH vault deposits
          if (vault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() ||
              vault.address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase()) {
            setPreferredAsset('ALL');
          }
        } else if (action === 'withdraw') {
          // Pre-fill vault as "from" and wallet as "to"
          const walletAccount: WalletAccount = {
            type: 'wallet',
            address: 'wallet',
            symbol: vault.symbol,
            balance: BigInt(0),
          };
          setFromAccount(vaultAccount);
          setToAccount(walletAccount);
          // Set default preferredAsset to 'WETH' for WETH vault withdrawals
          if (vault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() ||
              vault.address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase()) {
            setPreferredAsset('WETH');
          }
        }

        // Keep status as 'idle' so user stays on select page and can modify before proceeding
      }
    }
    // Only depend on searchParams and stable functions - morphoHoldings.positions is checked inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setFromAccount, setToAccount]);

  // Sync active tab with transaction type when accounts change
  // Only update if the tab would actually change to avoid unnecessary re-renders
  useEffect(() => {
    if (status === 'idle' && fromAccount && toAccount) {
      const expectedTab: TransactionTab | null = 
        fromAccount.type === 'wallet' && toAccount.type === 'vault' ? 'deposit' :
        fromAccount.type === 'vault' && toAccount.type === 'wallet' ? 'withdraw' :
        null;
      
      // Only update if tab would change
      if (expectedTab && expectedTab !== activeTab) {
        setActiveTab(expectedTab);
      }
    }
  }, [fromAccount, toAccount, status, activeTab]);

  // Memoize wallet account to avoid creating new objects on each render
  const walletAccount = useMemo<WalletAccount>(() => ({
    type: 'wallet' as const,
    address: 'wallet',
    symbol: 'Wallet',
    balance: BigInt(0),
  }), []);

  // Initialize accounts based on active tab when page first loads (if no accounts set and no URL params)
  useEffect(() => {
    const vaultAddress = searchParams.get('vault');
    const action = searchParams.get('action');
    
    // Only initialize if no URL params and no accounts are set
    if (!vaultAddress && !action && status === 'idle' && !fromAccount && !toAccount) {
      if (activeTab === 'deposit') {
        // Deposit: pre-select wallet as "from"
        setFromAccount(walletAccount);
      } else if (activeTab === 'withdraw') {
        // Withdraw: pre-select wallet as "to"
        setToAccount(walletAccount);
      }
    }
  }, [activeTab, status, fromAccount, toAccount, walletAccount, setFromAccount, setToAccount, searchParams]);

  // Handle tab changes - reset and pre-select accounts based on tab
  const handleTabChange = useCallback((tab: TransactionTab) => {
    if (tab === activeTab || status !== 'idle') return;
    
    setActiveTab(tab);
    setAmount('');
    setPreferredAsset(undefined); // Reset preferred asset when switching tabs
    
    // Reset accounts when switching tabs
    if (tab === 'deposit') {
      // Deposit: wallet to vault
      setFromAccount(walletAccount);
      setToAccount(null);
    } else {
      // Withdraw: vault to wallet
      setFromAccount(null);
      setToAccount(walletAccount);
    }
  }, [activeTab, walletAccount, setFromAccount, setToAccount, setAmount, setPreferredAsset, status]);

  // Get vault position for share balance - use data already fetched in WalletContext
  const vaultPosition = useMemo(() => {
    if (fromAccount?.type !== 'vault') return null;
    return morphoHoldings.positions.find(
      (pos) => pos.vault.address.toLowerCase() === (fromAccount as VaultAccount).address.toLowerCase()
    ) || null;
  }, [fromAccount, morphoHoldings.positions]);

  // Use shares from vaultPosition (already fetched via RPC in WalletContext using balanceOf)
  // This avoids redundant API calls - the position data is already up-to-date
  const vaultShareBalance = vaultPosition?.shares || null;

  // Use convertToAssets via RPC to get exact asset amount from shares (no precision loss)
  const { data: exactAssetAmount } = useReadContract({
    address: (fromAccount?.type === 'vault' && vaultShareBalance ? (fromAccount as VaultAccount).address : undefined) as `0x${string}`,
    abi: ERC4626_ABI,
    functionName: 'convertToAssets',
    args: vaultShareBalance && fromAccount?.type === 'vault'
      ? [BigInt(vaultShareBalance)]
      : undefined,
    query: {
      enabled: fromAccount?.type === 'vault' && !!vaultShareBalance && BigInt(vaultShareBalance) > BigInt(0),
    },
  });

  // Helper function to get combined ETH + WETH balance for WETH vault deposits
  // Note: All ETH can be wrapped since USDC can be used for gas on Base
  const getCombinedEthWethBalance = useMemo(() => {
    const ethBal = parseFloat(ethBalance || '0');
    const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
    const wethBal = wethToken ? parseFloat(formatUnits(wethToken.balance, wethToken.decimals)) : 0;
    // All ETH can be wrapped - no gas reserve needed since USDC can be used for gas on Base
    return wethBal + ethBal;
  }, [ethBalance, tokenBalances]);

  // Helper function to get wallet balance display text
  const getWalletBalanceText = useMemo(() => {
    if (!derivedAsset) return '';
    
    if (toAccount?.type === 'vault') {
      const toVault = toAccount as VaultAccount;
      const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase();
      
      if (isWethVault && (derivedAsset.symbol === 'WETH' || derivedAsset.symbol === 'ETH')) {
        const combinedBal = getCombinedEthWethBalance;
        const ethBal = parseFloat(ethBalance || '0');
        const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
        const wethBal = wethToken ? parseFloat(formatUnits(wethToken.balance, wethToken.decimals)) : 0;
        
        if (wethBal > 0 && ethBal > 0) {
          return `${formatAvailableBalance(combinedBal, 'WETH')} (${formatAssetBalance(wethBal, 'WETH')} + ${formatAssetBalance(ethBal, 'ETH')} wrappable)`;
        } else if (wethBal > 0) {
          return formatAvailableBalance(wethBal, 'WETH');
        } else if (ethBal > 0) {
          return `${formatAvailableBalance(ethBal, 'ETH')} (wrappable to WETH)`;
        }
        return formatAvailableBalance('0', 'WETH');
      }
    }
    
    if (derivedAsset.symbol === 'ETH' || derivedAsset.symbol === 'WETH') {
      return formatAvailableBalance(ethBalance || '0', derivedAsset.symbol);
    }
    
    const token = tokenBalances.find((t) => t.symbol.toUpperCase() === derivedAsset.symbol.toUpperCase());
    if (token) {
      // Use raw balance string from formatUnits to preserve full precision for small amounts
      // Pass as string to avoid floating point precision loss
      const balanceString = formatUnits(token.balance, token.decimals);
      return formatAvailableBalance(balanceString, derivedAsset.symbol, token.decimals);
    }
    return formatAvailableBalance('0', derivedAsset.symbol);
  }, [derivedAsset, toAccount, ethBalance, tokenBalances, getCombinedEthWethBalance]);

  // Helper function to get vault balance display text
  // For withdrawals, we display shares converted to assets using convertToAssets for accuracy
  const getVaultBalanceText = useMemo(() => {
    if (!fromAccount || fromAccount.type !== 'vault' || !derivedAsset) return '';
    
    const vaultAccount = fromAccount as VaultAccount;
    const assetDecimals = getAssetDecimals(vaultAccount.symbol);

    if (!vaultShareBalance) {
      if (morphoHoldings.isLoading) {
        return `Loading...`;
      }
      return `Available: 0.00 ${derivedAsset.symbol}`;
    }

    const sharesBigInt = BigInt(vaultShareBalance);
    
    if (sharesBigInt === BigInt(0)) {
      return `Available: 0.00 ${derivedAsset.symbol}`;
    }
    
    // Use convertToAssets for exact amount (no precision loss)
    if (exactAssetAmount !== undefined) {
      const assetAmount = parseFloat(formatUnits(exactAssetAmount, assetDecimals));
      return formatAvailableBalance(assetAmount, derivedAsset.symbol, assetDecimals);
    }
    
    // Show loading if convertToAssets not available yet
    return `Loading...`;
  }, [fromAccount, derivedAsset, vaultShareBalance, exactAssetAmount, morphoHoldings.isLoading]);

  // Get max amount as a number for validation
  // For vaults: returns exact asset amount from full share balance (no dust)
  // For wallet tokens: returns full balance (no dust) except ETH which leaves gas reserve
  // Returns null only for loading states, returns 0 for zero balance
  const getMaxAmount = useMemo(() => {
    if (!fromAccount || !derivedAsset) return 0;

    if (fromAccount.type === 'wallet') {
      const symbol = derivedAsset.symbol;
      if (toAccount?.type === 'vault') {
        const toVault = toAccount as VaultAccount;
        const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() ||
                           toVault.address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase();
        if (isWethVault && (symbol === 'WETH' || symbol === 'ETH')) {
          // For WETH vault deposits: respect preferredAsset selection
          const assetPreference = preferredAsset || 'ALL';
          
          if (assetPreference === 'ETH') {
            // Only use ETH (all can be wrapped since USDC can be used for gas)
            const ethBal = parseFloat(ethBalance || '0');
            return ethBal;
          } else if (assetPreference === 'WETH') {
            // Only use WETH balance
            const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
            if (wethToken) {
              return parseFloat(formatUnits(wethToken.balance, wethToken.decimals));
            }
            return 0;
          } else {
            // ALL: use both ETH + WETH (USDC can be used for gas on Base)
            return getCombinedEthWethBalance;
          }
        }
      }
      
      if (symbol === 'ETH') {
        // For ETH: leave small dust amount (0.001 ETH) for gas
        const ethBal = parseFloat(ethBalance || '0');
        const gasReserve = 0.001; // 0.001 ETH reserve for gas
        return Math.max(0, ethBal - gasReserve);
      }
      
      if (symbol === 'WETH') {
        // For WETH: use full balance (no dust)
        const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
        if (wethToken) {
          return parseFloat(formatUnits(wethToken.balance, wethToken.decimals));
        }
        return 0;
      }
      
      // For all other tokens (USDC, cbBTC, etc.): use full balance (no dust)
      const token = tokenBalances.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
      if (token) {
        return parseFloat(formatUnits(token.balance, token.decimals));
      }
    } else {
      // For vault withdrawals: use convertToAssets to get exact asset amount from full share balance
      const vaultAccount = fromAccount as VaultAccount;
      const assetDecimals = getAssetDecimals(vaultAccount.symbol);

      if (!vaultShareBalance) {
        return 0;
      }

      const sharesBigInt = BigInt(vaultShareBalance);
      
      if (sharesBigInt === BigInt(0)) {
        return 0;
      }
      
      // Use convertToAssets to get exact asset amount (no precision loss, includes all shares)
      if (exactAssetAmount !== undefined) {
        return parseFloat(formatUnits(exactAssetAmount, assetDecimals));
      }
      
      // Return 0 to show loading if convertToAssets not available yet (still allows input)
      return 0;
    }
    return 0;
  }, [fromAccount, derivedAsset, toAccount, ethBalance, tokenBalances, vaultShareBalance, exactAssetAmount, getCombinedEthWethBalance, preferredAsset]);

  // Calculate max amount for the selected "from" account
  const calculateMaxAmount = useCallback(() => {
    const maxAmount = getMaxAmount;
    if (maxAmount === null || maxAmount === 0) {
      setAmount('0');
      return;
    }

    if (fromAccount?.type === 'wallet') {
      const symbol = derivedAsset?.symbol || '';
      // Check if this is a WETH vault deposit - respect preferredAsset selection
      if (toAccount?.type === 'vault') {
        const toVault = toAccount as VaultAccount;
        const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() || 
                           toVault.address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase();
        if (isWethVault && (symbol === 'WETH' || symbol === 'ETH')) {
          // For WETH vault deposits: use calculated max based on preferredAsset
          const assetPreference = preferredAsset || 'ALL';
          const decimals = getAssetDecimals(symbol);
          
          if (assetPreference === 'ETH') {
            // Use ETH balance directly
            setAmount(maxAmount > 0 ? formatAssetAmountForMax(maxAmount, 'ETH', decimals) : '0');
          } else if (assetPreference === 'WETH') {
            // Use WETH balance directly
            const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
            if (wethToken) {
              setAmount(formatBigIntForInput(wethToken.balance, wethToken.decimals));
            } else {
              setAmount('0');
            }
          } else {
            // ALL: use combined ETH+WETH balance
            setAmount(maxAmount > 0 ? formatAssetAmountForMax(maxAmount, symbol, decimals) : '0');
          }
          return;
        }
      }
      
      if (symbol === 'ETH') {
        // For ETH: use calculated max (which already accounts for gas reserve)
        setAmount(maxAmount > 0 ? formatAssetAmountForMax(maxAmount, symbol) : '0');
      } else if (symbol === 'WETH') {
        // For WETH: use full balance
        const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
        if (wethToken) {
          setAmount(formatBigIntForInput(wethToken.balance, wethToken.decimals));
        } else {
          setAmount('0');
        }
      } else {
        // For all other tokens (USDC, cbBTC, etc.): use full balance
        const token = tokenBalances.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
        if (token) {
          setAmount(formatBigIntForInput(token.balance, token.decimals));
        } else {
          setAmount('0');
        }
      }
    } else {
      // For vault withdrawals: use exact asset amount from convertToAssets
      const vaultAccount = fromAccount as VaultAccount;
      const decimals = getAssetDecimals(vaultAccount.symbol);
      setAmount(formatAssetAmountForMax(maxAmount, derivedAsset?.symbol || '', decimals));
    }
  }, [getMaxAmount, fromAccount, toAccount, derivedAsset, tokenBalances, preferredAsset, setAmount]);

  const handleAmountChange = (value: string) => {
    if (value === '') {
      setAmount('');
      return;
    }
    
    if (!/^\d*\.?\d*$/.test(value)) {
      return;
    }
    
    // Allow any amount to be entered - validation happens when user tries to continue
    setAmount(value);
  };
  
  // Check if entered amount exceeds available balance
  const exceedsBalance = useMemo(() => {
    if (!amount || !fromAccount || !derivedAsset) return false;
    
    const enteredAmount = parseFloat(amount);
    if (isNaN(enteredAmount) || enteredAmount <= 0) return false;
    
    const maxAmount = getMaxAmount;
    // Allow checking even if maxAmount is 0 (no balance)
    if (maxAmount === null) return false;
    
    return enteredAmount > maxAmount;
  }, [amount, fromAccount, derivedAsset, getMaxAmount]);

  const handleStartTransaction = () => {
    if (fromAccount && toAccount && derivedAsset) {
      setStatus('preview');
    }
  };

  const handleReset = () => {
    reset();
    router.push('/transact');
  };

  const handleFlipAccounts = () => {
    if (fromAccount && toAccount) {
      const temp = fromAccount;
      setFromAccount(toAccount);
      setToAccount(temp);
      // Clear amount when flipping since the available balance changes
      setAmount('');
    }
  };

  // Calculate available accounts for "From" selector
  const availableFromAccounts = useMemo(() => {
    const walletAccount: WalletAccount = {
      type: 'wallet',
      address: 'wallet',
      symbol: 'Wallet',
      balance: BigInt(0),
    };

    const vaultAccounts: VaultAccount[] = Object.values(VAULTS)
      .filter((vault) => version === 'all' || vault.version === version)
      .map((vault): VaultAccount => {
      const position = morphoHoldings.positions.find(
        (pos) => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
      );

      return {
        type: 'vault' as const,
        address: vault.address,
        name: vault.name,
        symbol: vault.symbol,
        balance: position ? BigInt(position.shares) : BigInt(0),
        assetAddress: '',
        assetDecimals: getAssetDecimals(vault.symbol),
      };
    });

    return [walletAccount, ...vaultAccounts].filter((account) => {
      // Exclude the account selected in "To" if it's the same
      if (toAccount) {
        if (account.type === 'wallet' && toAccount.type === 'wallet') {
          return false;
        }
        if (account.type === 'vault' && toAccount.type === 'vault') {
          return (account as VaultAccount).address.toLowerCase() !== (toAccount as VaultAccount).address.toLowerCase();
        }
      }
      return true;
    });
  }, [toAccount, morphoHoldings.positions, version]);

  // Calculate available accounts for "To" selector
  const availableToAccounts = useMemo(() => {
    const walletAccount: WalletAccount = {
      type: 'wallet',
      address: 'wallet',
      symbol: 'Wallet',
      balance: BigInt(0),
    };

    // If "From" is a vault, only show wallet (prevent vault-to-vault)
    if (fromAccount && fromAccount.type === 'vault') {
      return [walletAccount];
    }

    const vaultAccounts: VaultAccount[] = Object.values(VAULTS)
      .filter((vault) => version === 'all' || vault.version === version)
      .map((vault): VaultAccount => {
        const position = morphoHoldings.positions.find(
          (pos) => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
        );

        return {
          type: 'vault' as const,
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          balance: position ? BigInt(position.shares) : BigInt(0),
          assetAddress: '',
          assetDecimals: getAssetDecimals(vault.symbol),
        };
      });

    return [walletAccount, ...vaultAccounts].filter((account) => {
      if (!fromAccount) {
        return true;
      }
      if (account.type !== fromAccount.type) {
        return true;
      }
      if (account.type === 'wallet') {
        return false;
      }
      const accountVault = account as unknown as VaultAccount;
      const fromVault = fromAccount as unknown as VaultAccount;
      return accountVault.address.toLowerCase() !== fromVault.address.toLowerCase();
    });
  }, [fromAccount, morphoHoldings.positions, version]);

  // Auto-select "From" account if there's only one option
  useEffect(() => {
    if (!fromAccount && availableFromAccounts.length === 1 && status === 'idle') {
      setFromAccount(availableFromAccounts[0]);
    }
  }, [fromAccount, availableFromAccounts, status, setFromAccount]);

  // Auto-select "To" account if there's only one option
  useEffect(() => {
    if (!toAccount && availableToAccounts.length === 1 && status === 'idle') {
      setToAccount(availableToAccounts[0]);
    }
  }, [toAccount, availableToAccounts, status, setToAccount]);

  if (!isConnected) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-8 text-center">
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-sm text-[var(--foreground-secondary)]">
            Please connect your wallet to start making transactions.
          </p>
        </div>
      </div>
    );
  }

  const getProgressSteps = () => {
    const baseSteps = [
      { label: 'Select', completed: false, active: false },
      { label: 'Review', completed: false, active: false },
      { label: 'Confirmation', completed: false, active: false }
    ];

    if (status === 'success') {
      return baseSteps.map(step => ({ ...step, completed: true }));
    }
    
    if (status === 'preview') {
      return [
        { ...baseSteps[0], completed: true },
        { ...baseSteps[1], active: true },
        baseSteps[2]
      ];
    }
    
    if (status === 'signing' || status === 'approving' || status === 'confirming') {
      return [
        { ...baseSteps[0], completed: true },
        { ...baseSteps[1], active: true },
        baseSteps[2]
      ];
    }
    
    return [
      { ...baseSteps[0], active: true },
      baseSteps[1],
      baseSteps[2]
    ];
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-[var(--foreground)] mb-2">
          Transfer Assets
        </h1>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Move assets between your wallet and vaults.
        </p>
      </div>

      {/* Progress Bar - Always visible */}
      <TransactionProgressBar steps={getProgressSteps()} isSuccess={status === 'success'} />

      {status === 'idle' && (
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-4 md:p-6 space-y-4 md:space-y-6">
          {/* Deposit/Withdraw Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => handleTabChange('deposit')}
              disabled={status !== 'idle'}
              className={`flex-1 px-4 py-3 md:py-2.5 rounded-lg font-medium text-sm md:text-sm transition-colors min-h-[44px] md:min-h-0 ${
                activeTab === 'deposit'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--background)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]'
              } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]`}
            >
              Deposit
            </button>
            <button
              onClick={() => handleTabChange('withdraw')}
              disabled={status !== 'idle'}
              className={`flex-1 px-4 py-3 md:py-2.5 rounded-lg font-medium text-sm md:text-sm transition-colors min-h-[44px] md:min-h-0 ${
                activeTab === 'withdraw'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--background)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]'
              } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]`}
            >
              Withdraw
            </button>
          </div>
          {/* From Account */}
          <AccountSelector
            label="From"
            selectedAccount={fromAccount}
            onSelect={(account) => {
              // If wallet is selected and it's already selected in "to", unselect it from "to"
              if (account?.type === 'wallet' && toAccount?.type === 'wallet') {
                setToAccount(null);
              }
              // If vault is selected and "to" is also a vault, unselect "to" (prevent vault-to-vault)
              if (account?.type === 'vault' && toAccount?.type === 'vault') {
                setToAccount(null);
              }
              setFromAccount(account);
              
              // Set default preferredAsset for WETH vault withdrawals
              if (account?.type === 'vault' && toAccount?.type === 'wallet' && activeTab === 'withdraw') {
                const vault = account as VaultAccount;
                if (vault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() ||
                    vault.address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase()) {
                  setPreferredAsset('WETH');
                } else {
                  // Reset preferredAsset for non-WETH vaults
                  setPreferredAsset(undefined);
                }
              } else if (!account || account.type === 'wallet') {
                // Reset preferredAsset when deselecting vault or selecting wallet
                setPreferredAsset(undefined);
              }
            }}
            excludeAccount={toAccount}
            assetSymbol={derivedAsset?.symbol || null}
          />

          {/* Flip Button */}
          <div className="flex justify-center -my-2">
            <button
              type="button"
              onClick={handleFlipAccounts}
              disabled={!fromAccount || !toAccount}
              className="p-2 rounded-lg bg-[var(--background)] border border-[var(--border-subtle)] hover:border-[var(--primary)] hover:bg-[var(--surface-elevated)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[var(--border-subtle)] disabled:hover:bg-[var(--background)] cursor-pointer"
              aria-label="Flip accounts"
            >
              <Icon
                name="arrow-swap"
                size="md"
                color="secondary"
                className="text-[var(--foreground-secondary)] rotate-90"
              />
            </button>
          </div>

          {/* To Account */}
          <AccountSelector
            label="To"
            selectedAccount={toAccount}
            onSelect={(account) => {
              // If wallet is selected and it's already selected in "from", unselect it from "from"
              if (account?.type === 'wallet' && fromAccount?.type === 'wallet') {
                setFromAccount(null);
              }
              // If vault is selected and "from" is also a vault, unselect "from" (prevent vault-to-vault)
              if (account?.type === 'vault' && fromAccount?.type === 'vault') {
                setFromAccount(null);
              }
              setToAccount(account);
              
              // Set default preferredAsset to 'ALL' when WETH vault is selected for deposit
              if (account?.type === 'vault' && fromAccount?.type === 'wallet' && activeTab === 'deposit') {
                const vault = account as VaultAccount;
                if (vault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() ||
                    vault.address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase()) {
                  setPreferredAsset('ALL');
                } else {
                  // Reset preferredAsset for non-WETH vaults
                  setPreferredAsset(undefined);
                }
              } else if (!account || account.type === 'wallet') {
                // Reset preferredAsset when deselecting vault or selecting wallet
                setPreferredAsset(undefined);
              }
            }}
            excludeAccount={fromAccount}
            filterByAssetSymbol={fromAccount?.type === 'vault' ? (fromAccount as VaultAccount).symbol : null}
            assetSymbol={derivedAsset?.symbol || null}
          />


          {/* Amount Input */}
          {fromAccount && derivedAsset && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-[var(--foreground-secondary)]">
                  Amount ({derivedAsset.symbol})
                </label>
                <div className="flex items-center gap-2">
                  {/* ETH/WETH/All Dropdown for WETH Vault - Next to MAX button */}
                  {(() => {
                    // Check if this is a WETH vault transaction
                    const isWethVaultDeposit = activeTab === 'deposit' && 
                      toAccount?.type === 'vault' && 
                      fromAccount?.type === 'wallet' &&
                      ((toAccount as VaultAccount).address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() || 
                       (toAccount as VaultAccount).address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase());
                    
                    const isWethVaultWithdraw = activeTab === 'withdraw' && 
                      fromAccount?.type === 'vault' && 
                      toAccount?.type === 'wallet' &&
                      ((fromAccount as VaultAccount).address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() || 
                       (fromAccount as VaultAccount).address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase());
                    
                    if (isWethVaultDeposit) {
                      const currentAsset = preferredAsset || 'ALL';
                      return (
                        <select
                          value={currentAsset}
                          onChange={(e) => setPreferredAsset(e.target.value as 'ETH' | 'WETH' | 'ALL')}
                          className="text-xs px-1.5 py-0.5 bg-[var(--background)] border border-[var(--border-subtle)] rounded text-[var(--foreground-muted)] hover:bg-[var(--surface-elevated)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="ALL">All (ETH + WETH)</option>
                          <option value="ETH">ETH</option>
                          <option value="WETH">WETH</option>
                        </select>
                      );
                    }
                    
                    if (isWethVaultWithdraw) {
                      const currentAsset = preferredAsset || 'WETH';
                      return (
                        <select
                          value={currentAsset}
                          onChange={(e) => setPreferredAsset(e.target.value as 'ETH' | 'WETH')}
                          className="text-xs px-1.5 py-0.5 bg-[var(--background)] border border-[var(--border-subtle)] rounded text-[var(--foreground-muted)] hover:bg-[var(--surface-elevated)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="WETH">WETH</option>
                          <option value="ETH">ETH</option>
                        </select>
                      );
                    }
                    
                    return null;
                  })()}
                  <button
                    type="button"
                    onClick={calculateMaxAmount}
                    disabled={getMaxAmount === null}
                    className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] disabled:text-[var(--foreground-muted)] disabled:cursor-not-allowed disabled:hover:text-[var(--foreground-muted)] cursor-pointer"
                  >
                    MAX
                  </button>
                </div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 pr-20 md:pr-24 bg-[var(--background)] border border-[var(--border-subtle)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-base md:text-base"
                />
                {/* Dollar amount display for BTC/ETH vault transactions - inside input */}
                {(() => {
                  if (!fromAccount || !toAccount || !derivedAsset || !amount) return null;
                  
                  const amountNum = parseFloat(amount);
                  if (isNaN(amountNum) || amountNum <= 0) return null;
                  
                  const vaultAddress = (toAccount.type === 'vault' 
                    ? (toAccount as VaultAccount).address 
                    : fromAccount.type === 'vault' 
                    ? (fromAccount as VaultAccount).address 
                    : null)?.toLowerCase();
                  
                  if (!vaultAddress) return null;
                  
                  const btcVaultAddress = VAULTS.cbBTC_VAULT.address.toLowerCase();
                  const wethVaultAddress = VAULTS.WETH_VAULT.address.toLowerCase();
                  const isBtcVault = vaultAddress === btcVaultAddress;
                  const isWethVault = vaultAddress === wethVaultAddress;
                  
                  let price: number | null = null;
                  if (isBtcVault && btcPrice && typeof btcPrice === 'number' && btcPrice > 0) {
                    price = btcPrice;
                  } else if (isWethVault && ethPrice && typeof ethPrice === 'number' && ethPrice > 0) {
                    price = ethPrice;
                  }
                  
                  if (!price) return null;
                  
                  const dollarAmount = amountNum * price;
                  if (isNaN(dollarAmount) || dollarAmount <= 0) return null;
                  
                  return (
                    <div className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <span className="text-xs md:text-sm text-[var(--foreground-muted)]">
                        ≈ {formatCurrency(dollarAmount)}
                      </span>
                    </div>
                  );
                })()}
              </div>
              {fromAccount && derivedAsset && (
                <p className="text-xs text-[var(--foreground-muted)]">
                  {fromAccount.type === 'wallet' ? getWalletBalanceText : getVaultBalanceText}
                </p>
              )}
              {/* Warning if amount exceeds available balance */}
              {exceedsBalance && (
                <div className="p-3 bg-[var(--warning-subtle)] rounded-lg border border-[var(--warning)]">
                  <p className="text-xs text-[var(--foreground)]">
                    <span className="font-medium">Warning:</span> Amount exceeds available balance. This transaction will fail if you proceed.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Validation message */}
          {(fromAccount && toAccount && fromAccount.type === 'wallet' && toAccount.type === 'wallet') || 
           (fromAccount && toAccount && fromAccount.type === 'vault' && toAccount.type === 'vault') ? (
            <div className="p-4 bg-[var(--warning-subtle)] rounded-lg border border-[var(--warning)]">
              <p className="text-sm text-[var(--foreground)]">
                {fromAccount.type === 'wallet' && toAccount.type === 'wallet'
                  ? 'Wallet-to-wallet transactions are not allowed. Please select a vault for one of the accounts.'
                  : 'Vault-to-vault transactions are not allowed. Please select a wallet for one of the accounts.'}
              </p>
            </div>
          ) : null}

          {/* Start Transaction Button */}
          <Button
            onClick={handleStartTransaction}
            disabled={
              !fromAccount || 
              !toAccount || 
              !derivedAsset || 
              !amount || 
              parseFloat(amount) <= 0 ||
              (fromAccount.type === 'wallet' && toAccount.type === 'wallet') || // Prevent wallet-to-wallet
              (fromAccount.type === 'vault' && toAccount.type === 'vault') // Prevent vault-to-vault
            }
            variant="primary"
            size="lg"
            fullWidth
          >
            Continue
          </Button>
        </div>
      )}

      {/* Transaction Flow (Preview, Progress, Success, Error) */}
      {(status === 'preview' || status === 'signing' || status === 'approving' || status === 'confirming' || status === 'success' || status === 'error') && (
        <TransactionFlow
          onSuccess={() => {
            setTimeout(() => {
              handleReset();
            }, 3000);
          }}
        />
      )}
    </div>
  );
}

