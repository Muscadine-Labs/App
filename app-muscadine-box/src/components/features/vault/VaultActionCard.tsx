'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits, parseUnits } from 'viem';
import { MorphoVaultData } from '@/types/vault';
import { useTransactionModal } from '@/contexts/TransactionModalContext';
import { useWallet } from '@/contexts/WalletContext';
import { formatSmartCurrency, formatAssetAmountSafe, formatAssetAmountForInput, formatBigIntForInput } from '@/lib/formatter';
import { Button } from '@/components/ui';
import { useOnClickOutside } from '@/hooks/onClickOutside';

interface VaultActionCardProps {
  vaultData: MorphoVaultData;
}

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// Vault ABI for ERC-4626 functions (vault shares are ERC20 tokens)
const VAULT_ABI = [
  {
    inputs: [],
    name: 'asset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function VaultActionCard({ vaultData }: VaultActionCardProps) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState<string>('');
  const [assetPrice, setAssetPrice] = useState<number | null>(null);
  const [assetAddress, setAssetAddress] = useState<string | null>(null);
  const [assetBalanceBigInt, setAssetBalanceBigInt] = useState<bigint | null>(null);
  const [showApyBreakdown, setShowApyBreakdown] = useState(false);
  const [showInterestBreakdown, setShowInterestBreakdown] = useState(false);
  const [userTransactions, setUserTransactions] = useState<Array<{ type: 'deposit' | 'withdraw'; timestamp: number; assetsUsd?: number }>>([]);
  const apyBreakdownRef = useRef<HTMLDivElement>(null);
  const interestBreakdownRef = useRef<HTMLDivElement>(null);
  const { isConnected, address } = useAccount();
  const { openTransactionModal, modalState } = useTransactionModal();
  const { morphoHoldings, tokenBalances, refreshBalances } = useWallet();
  const queryClient = useQueryClient();
  const lastSuccessTxHash = useRef<string | null>(null);

  // Click outside to close breakdowns
  useOnClickOutside(apyBreakdownRef, () => setShowApyBreakdown(false));
  useOnClickOutside(interestBreakdownRef, () => setShowInterestBreakdown(false));

  const isDepositDisabled = !isConnected;

  // Reset amount when switching tabs
  useEffect(() => {
    setAmount('');
  }, [activeTab]);

  // Get asset address from vault contract
  const { data: vaultAssetAddress } = useReadContract({
    address: vaultData.address as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'asset',
    query: { enabled: !!vaultData.address },
  });

  // Update asset address when fetched
  useEffect(() => {
    if (vaultAssetAddress) {
      setAssetAddress(vaultAssetAddress);
    }
  }, [vaultAssetAddress]);

  // Get ETH balance (for WETH vaults)
  // Disable caching to ensure balances update immediately after transactions
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address: address as `0x${string}`,
    query: { 
      enabled: !!address && vaultData.symbol.toUpperCase() === 'WETH',
      staleTime: 0, // Always consider data stale
      gcTime: 0, // Don't cache data
      refetchOnMount: true, // Always refetch on mount
      refetchOnWindowFocus: true, // Refetch when window regains focus
    },
  });

  // Get WETH token balance (for WETH vaults - need to sum with ETH)
  // Disable caching to ensure balances update immediately after transactions
  const { data: wethTokenBalance, refetch: refetchWethBalance } = useReadContract({
    address: assetAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { 
      enabled: !!assetAddress && !!address && vaultData.symbol.toUpperCase() === 'WETH',
      staleTime: 0, // Always consider data stale
      gcTime: 0, // Don't cache data
      refetchOnMount: true, // Always refetch on mount
      refetchOnWindowFocus: true, // Refetch when window regains focus
    },
  });

  // Get ERC20 token balance (for non-WETH tokens)
  // Disable caching to ensure balances update immediately after transactions
  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: assetAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { 
      enabled: !!assetAddress && !!address && vaultData.symbol.toUpperCase() !== 'WETH',
      staleTime: 0, // Always consider data stale
      gcTime: 0, // Don't cache data
      refetchOnMount: true, // Always refetch on mount
      refetchOnWindowFocus: true, // Refetch when window regains focus
    },
  });

  // Handle transaction success: refresh balances and clear input
  useEffect(() => {
    const isThisVault = modalState.vaultAddress?.toLowerCase() === vaultData.address.toLowerCase();
    const isSuccess = modalState.status === 'success';
    const isNewTx = modalState.txHash && modalState.txHash !== lastSuccessTxHash.current;
    
    if (isSuccess && isThisVault && isNewTx) {
      lastSuccessTxHash.current = modalState.txHash;
      setAmount('');
      
      const refreshData = async () => {
        try {
          queryClient.invalidateQueries();
          refreshBalances();
          
          const symbol = vaultData.symbol.toUpperCase();
          if (symbol === 'WETH') {
            refetchEthBalance();
            refetchWethBalance();
          } else {
            refetchTokenBalance();
          }
          
          // Refresh again after blockchain state updates
          await new Promise(resolve => setTimeout(resolve, 2000));
          queryClient.invalidateQueries();
          refreshBalances();
          
          if (symbol === 'WETH') {
            refetchEthBalance();
            refetchWethBalance();
          } else {
            refetchTokenBalance();
          }
        } catch (error) {
          console.error('Error refreshing balances after transaction:', error);
        }
      };
      
      refreshData();
    }
  }, [
    modalState.status, 
    modalState.vaultAddress, 
    modalState.txHash,
    vaultData.address, 
    vaultData.symbol,
    refreshBalances,
    refetchEthBalance,
    refetchWethBalance,
    refetchTokenBalance,
    queryClient
  ]);

  // Calculate asset balance for display (derived from calculateMaxDepositable)
  // This is kept minimal - actual balance calculation happens in calculateMaxDepositable

  // Helper function to calculate max depositable amount by rounding DOWN the BigInt balance
  // This prevents attempting to deposit more than available due to rounding issues
  // Uses full asset decimals precision to avoid leaving trace amounts
  // Recalculates automatically when balances change (ethBalance, wethTokenBalance, tokenBalance)
  const calculateMaxDepositable = useMemo(() => {
    const symbol = vaultData.symbol.toUpperCase();
    
    // For WETH, sum both ETH and WETH balances
    // Note: Must account for gas reserve when wrapping ETH (matches transaction logic)
    if (symbol === 'WETH') {
      const decimals = 18;
      const GAS_RESERVE = parseUnits('0.0001', 18); // Reserve ~0.0001 ETH for gas (matches transaction logic)
      
      let totalWei = BigInt(0);
      
      // Add WETH token balance (can be deposited directly, no gas reserve needed)
      if (wethTokenBalance) {
        totalWei += wethTokenBalance as bigint;
      }
      
      // Add ETH balance minus gas reserve (matches transaction validation logic)
      if (ethBalance?.value) {
        const availableEth = ethBalance.value > GAS_RESERVE 
          ? ethBalance.value - GAS_RESERVE 
          : BigInt(0);
        totalWei += availableEth;
      }
      
      if (totalWei === BigInt(0)) {
        return 0;
      }
      
      // Convert total to decimal representation - no rounding
      const decimalValue = formatUnits(totalWei, decimals);
      return parseFloat(decimalValue);
    }
    
    // For USDC, check wallet context first
    if (symbol === 'USDC') {
      const usdcBalance = tokenBalances.find(tb => tb.symbol === 'USDC');
      if (usdcBalance?.balance) {
        const decimals = usdcBalance.decimals || 6;
        // Store the BigInt balance for direct formatting
        setAssetBalanceBigInt(usdcBalance.balance);
        // Use the exact decimal value from the contract (no extra rounding)
        return parseFloat(formatUnits(usdcBalance.balance, decimals));
      }
    }
    
    // For other tokens (like cbBTC), use token balance from contract
    if (tokenBalance && vaultData.assetDecimals !== undefined) {
      const decimals = vaultData.assetDecimals;
      // Store the BigInt balance for direct formatting (avoids float precision issues)
      const balanceBigInt = tokenBalance as bigint;
      setAssetBalanceBigInt(balanceBigInt);
      const decimalValue = formatUnits(balanceBigInt, decimals);
      // Parse to float - this should preserve the value correctly
      // No need to round down here since we're working with the exact balance
      return parseFloat(decimalValue);
    }
    
    // Reset BigInt balance if no balance found
    setAssetBalanceBigInt(null);
    
    return 0;
  }, [ethBalance, wethTokenBalance, tokenBalance, tokenBalances, vaultData.symbol, vaultData.assetDecimals]);

  // Fetch asset price
  useEffect(() => {
    const fetchAssetPrice = async () => {
      const vaultSymbol = vaultData.symbol.toUpperCase();
      
      // For stablecoins, always use exactly 1.0 (don't fetch from API)
      if (vaultSymbol === 'USDC' || vaultSymbol === 'USDT' || vaultSymbol === 'DAI') {
        setAssetPrice(1);
        return;
      }
      
      try {
        // Map vault symbols to price API symbols (handle both original and uppercase)
        const symbolMap: Record<string, string> = {
          'cbBTC': 'BTC',
          'CBBTC': 'BTC', // uppercase version
          'CBTC': 'BTC',
          'WETH': 'ETH',
          'WBTC': 'BTC',
        };
        
        // Check both uppercase and original case
        const priceSymbol = symbolMap[vaultSymbol] || symbolMap[vaultData.symbol] || vaultSymbol;
        
        const response = await fetch(`/api/prices?symbols=${priceSymbol}`);
        if (!response.ok) {
          throw new Error('Failed to fetch price');
        }
        
        const data = await response.json();
        const priceKey = priceSymbol.toLowerCase();
        const price = data[priceKey];
        
        if (price && typeof price === 'number' && price > 0) {
          setAssetPrice(price);
        } else {
          console.warn(`Price not found for ${vaultSymbol} (mapped to ${priceSymbol}), got:`, data);
          setAssetPrice(null);
        }
      } catch (error) {
        console.error('Failed to fetch asset price:', error);
        setAssetPrice(null);
      }
    };

    fetchAssetPrice();
  }, [vaultData.symbol]);

  // Find the current vault position
  const currentVaultPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData.address.toLowerCase()
  );

  const userVaultValueUsd = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18) * currentVaultPosition.vault.state.sharePriceUsd : 0;

  // Get user's shares as BigInt for convertToAssets call
  const userSharesBigInt = currentVaultPosition 
    ? BigInt(currentVaultPosition.shares) 
    : BigInt(0);

  // Get vault's totalSupply (all vault shares) directly from contract
  // This is the authoritative source per Morpho/ERC-4626 documentation
  const { data: vaultTotalSupply } = useReadContract({
    address: vaultData.address as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'totalSupply',
    query: { 
      enabled: !!vaultData.address,
    },
  });

  // Use ERC-4626 convertToAssets function to get accurate withdrawable assets
  // This is the proper way according to Morpho/ERC-4626 standard
  const { data: withdrawableAssetsBigInt } = useReadContract({
    address: vaultData.address as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: userSharesBigInt > 0 ? [userSharesBigInt] : undefined,
    query: { 
      enabled: !!vaultData.address && !!currentVaultPosition && userSharesBigInt > 0,
    },
  });


  // Fetch user transactions to calculate interest earned
  useEffect(() => {
    const fetchActivity = async () => {
      if (!address || !currentVaultPosition) {
        setUserTransactions([]);
        return;
      }

      try {
        const userResponse = await fetch(
          `/api/vaults/${vaultData.address}/activity?chainId=${vaultData.chainId}&userAddress=${address}`
        );
        const userResponseData = await userResponse.json();
        setUserTransactions(userResponseData.transactions || []);
      } catch (error) {
        console.error('Failed to fetch activity:', error);
        setUserTransactions([]);
      }
    };

    fetchActivity();
  }, [vaultData.address, vaultData.chainId, address, currentVaultPosition]);

  // Calculate interest earned from transactions
  const calculateInterestEarned = useMemo(() => {
    if (!currentVaultPosition || userTransactions.length === 0) {
      return { totalInterest: 0, regularInterest: 0, rewardsInterest: 0 };
    }

    const sorted = [...userTransactions].sort((a, b) => a.timestamp - b.timestamp);
    
    const totalDeposits = sorted
      .filter(tx => tx.type === 'deposit')
      .reduce((sum, tx) => sum + (tx.assetsUsd || 0), 0);
    
    const totalWithdrawals = sorted
      .filter(tx => tx.type === 'withdraw')
      .reduce((sum, tx) => sum + (tx.assetsUsd || 0), 0);
    
    const netInvested = totalDeposits - totalWithdrawals;
    const totalEarnings = userVaultValueUsd - netInvested;
    
    // Split earnings between interest and rewards based on APY ratios
    const netApyPercent = vaultData.netApyWithoutRewards * 100;
    const rewardsAprPercent = vaultData.rewardsApr * 100;
    const totalApyPercent = netApyPercent + rewardsAprPercent;
    
    let regularInterest = totalEarnings;
    let rewardsInterest = 0;
    
    if (totalApyPercent > 0) {
      regularInterest = totalEarnings * (netApyPercent / totalApyPercent);
      rewardsInterest = totalEarnings * (rewardsAprPercent / totalApyPercent);
    }
    
    return {
      totalInterest: totalEarnings,
      regularInterest,
      rewardsInterest,
    };
  }, [currentVaultPosition, userTransactions, userVaultValueUsd, vaultData]);

  // Calculate projected earnings in USD
  // For deposit: current deposits + entered amount (if any)
  // For withdraw: current deposits - entered amount (if any)
  const enteredAmount = parseFloat(amount) || 0;
  const enteredAmountUsd = assetPrice ? enteredAmount * assetPrice : 0;
  
  // APY is already in decimal form (e.g., 0.05 for 5%)
  // For compound interest calculations:
  // - Yearly: Principal * APY (simple projection)
  // - Monthly: Principal * ((1 + APY)^(1/12) - 1) for compound, or Principal * (APY / 12) for simple approximation
  // We'll use the compound formula for accuracy since APY represents compound interest
  
  // Old interest (based on current deposits only) - in USD
  const apyDecimal = vaultData.apy; // Already in decimal form (0.05 = 5%)
  const oldYearlyInterest = userVaultValueUsd * apyDecimal;
  // Compound monthly interest: (1 + APY)^(1/12) - 1
  const monthlyRate = Math.pow(1 + apyDecimal, 1/12) - 1;
  const oldMonthlyInterest = userVaultValueUsd * monthlyRate;
  
  // New interest (based on current deposits +/- entered amount) - in USD
  let newDepositsUsd = userVaultValueUsd;
  if (activeTab === 'deposit' && enteredAmount > 0) {
    newDepositsUsd = userVaultValueUsd + enteredAmountUsd;
  } else if (activeTab === 'withdraw' && enteredAmount > 0) {
    newDepositsUsd = Math.max(0, userVaultValueUsd - enteredAmountUsd);
  }
  
  const newYearlyInterest = newDepositsUsd * apyDecimal;
  const newMonthlyInterest = newDepositsUsd * monthlyRate;
  
  // Use new values for display, but we'll show comparison when amount is entered
  const yearlyInterest = enteredAmount > 0 ? newYearlyInterest : oldYearlyInterest;
  const monthlyInterest = enteredAmount > 0 ? newMonthlyInterest : oldMonthlyInterest;

  // Calculate max values
  const maxDepositRaw = calculateMaxDepositable;
  
  // Calculate withdrawable amount using ERC-4626 convertToAssets function
  // Per Morpho documentation: use vault's totalSupply (all vault shares) for accurate calculation
  let maxWithdrawRaw = 0;
  if (withdrawableAssetsBigInt && withdrawableAssetsBigInt > 0) {
    // Primary: Use convertToAssets from contract (most accurate, handles all edge cases)
    // Don't convert to float - use BigInt directly in setMaxAmount to avoid precision loss
    const assetDecimals = vaultData.assetDecimals ?? 18;
    // Store as float for validation checks, but prefer BigInt for formatting
    const formatted = formatUnits(withdrawableAssetsBigInt, assetDecimals);
    maxWithdrawRaw = parseFloat(formatted);
  } else if (currentVaultPosition && vaultData.totalAssets && vaultTotalSupply) {
    // Fallback: Use vault's totalSupply from contract (per Morpho docs recommendation)
    // Formula: withdrawableAssets = (userShares / totalSupply) * totalAssets
    const userShares = parseFloat(currentVaultPosition.shares) / 1e18;
    const totalSupply = parseFloat(vaultTotalSupply.toString()) / 1e18;
    const totalAssets = parseFloat(vaultData.totalAssets || '0') / Math.pow(10, vaultData.assetDecimals ?? 18);
    
    if (totalSupply > 0) {
      maxWithdrawRaw = (userShares / totalSupply) * totalAssets;
    }
  } else if (currentVaultPosition && vaultData.totalAssets && currentVaultPosition.vault.state.totalSupply) {
    // Fallback 2: Use totalSupply from position data if contract call fails
    const userShares = parseFloat(currentVaultPosition.shares) / 1e18;
    const totalSupply = parseFloat(currentVaultPosition.vault.state.totalSupply) / 1e18;
    const totalAssets = parseFloat(vaultData.totalAssets || '0') / Math.pow(10, vaultData.assetDecimals ?? 18);
    
    if (totalSupply > 0) {
      maxWithdrawRaw = (userShares / totalSupply) * totalAssets;
    }
  } else if (assetPrice && userVaultValueUsd > 0) {
    // Last resort: USD conversion (least accurate)
    maxWithdrawRaw = userVaultValueUsd / assetPrice;
  }
  
  // Parse current amount once, used throughout
  const currentAmount = parseFloat(amount) || 0;
  
  // Calculate remaining balances
  const remainingDeposit = Math.max(0, maxDepositRaw - currentAmount);
  const remainingWithdraw = Math.max(0, maxWithdrawRaw - currentAmount);

  // Check if amount exceeds max (with small epsilon for floating-point precision)
  const EPSILON = 1e-8;
  const exceedsMaxDeposit = currentAmount > maxDepositRaw + EPSILON;
  const exceedsMaxWithdraw = currentAmount > maxWithdrawRaw + EPSILON;
  
  // Format balance for display
  const assetBalance = maxDepositRaw > 0 ? formatAssetAmountSafe(maxDepositRaw, {
    decimals: vaultData.assetDecimals ?? 18,
    symbol: vaultData.symbol,
    roundMode: 'down',
    trimZeros: true,
  }) : '0.00';

  const handleDeposit = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    if (isDepositDisabled) {
      return;
    }

    const amountToPass = amount?.trim() || '';
    
    if (!amountToPass || parseFloat(amountToPass) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    openTransactionModal(
      'deposit',
      vaultData.address,
      vaultData.name,
      vaultData.symbol,
      amountToPass
    );
  };

  const handleWithdraw = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    const amountToPass = amount?.trim() || '';
    
    if (!amountToPass || parseFloat(amountToPass) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    openTransactionModal(
      'withdraw',
      vaultData.address,
      vaultData.name,
      vaultData.symbol,
      amountToPass
    );
  };

  // Handle input change with max validation
  const handleAmountChange = (value: string) => {
    // Allow empty string for better UX
    if (value === '') {
      setAmount('');
      return;
    }
    
    // Allow typing numbers and decimal point
    if (!/^\d*\.?\d*$/.test(value)) {
      return; // Don't update if invalid characters
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setAmount(value);
      return;
    }
    
    // Don't auto-correct while typing, just allow it
    // Validation will happen on blur
    setAmount(value);
  };

  // Set max amount
  // Use formatter library functions for consistent formatting
  const setMaxAmount = (isDeposit: boolean) => {
    const contractDecimals = vaultData.assetDecimals ?? 18;
    
    if (isDeposit) {
      // Use BigInt directly if available (BTC, USDC, etc.) - most accurate, avoids float precision issues
      if (assetBalanceBigInt !== null) {
        setAmount(formatBigIntForInput(assetBalanceBigInt, contractDecimals));
        return;
      }
      
      // Fallback for WETH: Use maxDepositRaw with formatAssetAmountForInput
      // This handles the float precision carefully with truncation
      setAmount(formatAssetAmountForInput(maxDepositRaw, contractDecimals, 'down'));
    } else {
      // For withdraw, use BigInt directly if available (most accurate, avoids float precision issues)
      if (withdrawableAssetsBigInt && withdrawableAssetsBigInt > 0) {
        setAmount(formatBigIntForInput(withdrawableAssetsBigInt, contractDecimals));
      } else {
        // Fallback: Use maxWithdrawRaw with formatAssetAmountForInput
        setAmount(formatAssetAmountForInput(maxWithdrawRaw, contractDecimals, 'down'));
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => setActiveTab('deposit')}
          className={`flex-1 px-6 py-4 text-base font-medium transition-colors relative ${
            activeTab === 'deposit'
              ? 'text-[var(--foreground)]'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          Deposit
          {activeTab === 'deposit' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] -mb-px" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`flex-1 px-6 py-4 text-base font-medium transition-colors relative ${
            activeTab === 'withdraw'
              ? 'text-[var(--foreground)]'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          Withdraw
          {activeTab === 'withdraw' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] -mb-px" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6 space-y-6">
        {activeTab === 'deposit' ? (
          <>
            {/* Deposit Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--foreground-secondary)]">
                  Deposit {vaultData.symbol}
                </label>
                <button
                  type="button"
                  onClick={() => setMaxAmount(true)}
                  disabled={isDepositDisabled || maxDepositRaw <= 0}
                  className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (isNaN(val) || val < 0) {
                    setAmount('');
                  } else if (val > maxDepositRaw + EPSILON) {
                    // Cap at raw max deposit value - use formatter for consistency
                    const contractDecimals = vaultData.assetDecimals ?? 18;
                    // Use BigInt if available for maximum accuracy
                    if (assetBalanceBigInt !== null) {
                      setAmount(formatBigIntForInput(assetBalanceBigInt, contractDecimals));
                    } else {
                      setAmount(formatAssetAmountForInput(maxDepositRaw, contractDecimals, 'down'));
                    }
                  } else if (val > 0) {
                    // Format user input with formatter to ensure proper decimal places
                    const contractDecimals = vaultData.assetDecimals ?? 18;
                    setAmount(formatAssetAmountForInput(val, contractDecimals, 'down'));
                  } else {
                    setAmount('');
                  }
                }}
                placeholder="0.00"
                disabled={isDepositDisabled}
                className={`w-full px-4 py-3 bg-[var(--background)] border rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  exceedsMaxDeposit
                    ? 'border-[var(--danger)] focus:ring-[var(--danger)]'
                    : 'border-[var(--border-subtle)] focus:ring-[var(--primary)]'
                }`}
              />
              {exceedsMaxDeposit && (
                <p className="text-xs text-[var(--danger)]">
                  Amount exceeds your available balance of {assetBalance} {vaultData.symbol}
                </p>
              )}
              {parseFloat(amount) > 0 && !exceedsMaxDeposit && (
                <p className="text-xs text-[var(--foreground-secondary)]">
                  {assetPrice ? formatSmartCurrency(parseFloat(amount) * assetPrice) : '$0.00'}
                </p>
              )}
              <p className={`text-xs ${
                exceedsMaxDeposit 
                  ? 'text-[var(--danger)]' 
                  : 'text-[var(--foreground-muted)]'
              }`}>
                {currentAmount > 0 
                  ? `${formatAssetAmountSafe(remainingDeposit, {
                      decimals: vaultData.assetDecimals ?? 18,
                      symbol: vaultData.symbol,
                      roundMode: 'down',
                      trimZeros: true,
                    })} ${vaultData.symbol} remaining`
                  : `${assetBalance} ${vaultData.symbol} available`
                }
              </p>
            </div>

            {/* Position Info & Projections - Always Visible */}
            <div className="bg-[var(--surface-elevated)] rounded-lg p-4 space-y-3">
              {/* Current Deposits */}
              {isConnected && currentVaultPosition && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--foreground-secondary)]">Current Deposits</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    ${userVaultValueUsd.toFixed(4)}
                  </span>
                </div>
              )}

              {/* Interest Earned - Only show if positive (negative values are due to asset price changes, not actual negative interest) */}
              {isConnected && currentVaultPosition && userTransactions.length > 0 && calculateInterestEarned.totalInterest > 0 && (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 relative">
                    <span className="text-sm text-[var(--foreground-secondary)]">Interest Earned</span>
                    <div ref={interestBreakdownRef}>
                      <button
                        onClick={() => setShowInterestBreakdown(!showInterestBreakdown)}
                        className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
                        aria-label="Interest breakdown"
                      >
                        <span className="text-[10px] text-[var(--foreground-secondary)] font-semibold">i</span>
                      </button>
                      
                      {showInterestBreakdown && (
                        <div className="absolute top-full left-0 mt-2 z-10 bg-[var(--surface-elevated)] rounded-lg p-4 text-sm shadow-lg border border-[var(--border-subtle)] min-w-[200px]">
                          <div className="mb-3 pb-3 border-b border-[var(--border-subtle)]">
                            <span className="text-sm font-semibold text-[var(--foreground)]">Interest Breakdown</span>
                          </div>
                          <div className="space-y-2.5">
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[var(--foreground)]">Regular Interest</span>
                              <span className="text-[var(--foreground)] font-medium">
                                {formatSmartCurrency(calculateInterestEarned.regularInterest)}
                              </span>
                            </div>
                            
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[var(--foreground)]">
                                {vaultData.rewardSymbol || 'Morpho'} Rewards
                              </span>
                              <span className="text-[var(--foreground)] font-medium">
                                {formatSmartCurrency(calculateInterestEarned.rewardsInterest)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-[var(--success)]">
                    +{formatSmartCurrency(calculateInterestEarned.totalInterest)}
                  </span>
                </div>
              )}
              
              {/* APY Stats */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 relative">
                  <span className="text-sm text-[var(--foreground-secondary)]">APY</span>
                  <div ref={apyBreakdownRef}>
                    <button
                      onClick={() => setShowApyBreakdown(!showApyBreakdown)}
                      className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
                      aria-label="APY breakdown"
                    >
                      <span className="text-[10px] text-[var(--foreground-secondary)] font-semibold">i</span>
                    </button>
                    
                    {showApyBreakdown && (
                      <div className="absolute top-full left-0 mt-2 z-10 bg-[var(--surface-elevated)] rounded-lg p-4 text-sm shadow-lg border border-[var(--border-subtle)] min-w-[200px]">
                        <div className="mb-3 pb-3 border-b border-[var(--border-subtle)]">
                          <span className="text-sm font-semibold text-[var(--foreground)]">APY Breakdown</span>
                        </div>
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[var(--foreground)]">{vaultData.symbol}</span>
                            <span className="text-[var(--foreground)] font-medium">
                              {((vaultData.netApyWithoutRewards || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[var(--foreground)]">
                              {vaultData.rewardSymbol || 'REWARDS'}
                            </span>
                            <span className="text-[var(--foreground)] font-medium">
                              {((vaultData.rewardsApr || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          
                          {vaultData.performanceFee !== undefined && vaultData.performanceFee > 0 && (
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[var(--foreground)]">
                                Perf. Fee ({vaultData.performanceFee.toFixed(0)}%)
                              </span>
                              <span className="text-[var(--foreground)] font-medium">
                                -{(((vaultData.netApyWithoutRewards || 0) + (vaultData.rewardsApr || 0)) * (vaultData.performanceFee / 100) * 100).toFixed(2)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {(vaultData.apy * 100).toFixed(2)}%
                </span>
              </div>
              
              {/* Interest - Always Visible with Comparison */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--foreground-secondary)]">Monthly interest</span>
                <div className="flex items-center gap-2">
                  {enteredAmount > 0 ? (
                    <>
                      <span className="text-sm font-medium text-[var(--foreground-muted)]">
                        {formatSmartCurrency(oldMonthlyInterest)}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-[var(--foreground-secondary)]"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {formatSmartCurrency(newMonthlyInterest)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {formatSmartCurrency(monthlyInterest)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--foreground-secondary)]">Yearly interest</span>
                <div className="flex items-center gap-2">
                  {enteredAmount > 0 ? (
                    <>
                      <span className="text-sm font-medium text-[var(--foreground-muted)]">
                        {formatSmartCurrency(oldYearlyInterest)}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-[var(--foreground-secondary)]"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {formatSmartCurrency(newYearlyInterest)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {formatSmartCurrency(yearlyInterest)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Deposit Button */}
            <Button
              onClick={handleDeposit}
              disabled={isDepositDisabled || exceedsMaxDeposit || currentAmount <= 0}
              variant="primary"
              size="lg"
              fullWidth
            >
              {isDepositDisabled ? 'Deposit disabled' : exceedsMaxDeposit ? 'Amount too high' : currentAmount <= 0 ? 'Enter amount' : 'Deposit'}
            </Button>
          </>
        ) : (
          <>
            {/* Withdraw Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--foreground-secondary)]">
                  Withdraw {vaultData.symbol}
                </label>
                {currentVaultPosition && (
                  <button
                    type="button"
                    onClick={() => setMaxAmount(false)}
                    disabled={!isConnected || maxWithdrawRaw <= 0}
                    className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    MAX
                  </button>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (isNaN(val) || val < 0) {
                    setAmount('');
                  } else {
                    // Use formatter for consistency
                    const contractDecimals = vaultData.assetDecimals ?? 18;
                    if (val > maxWithdrawRaw + EPSILON) {
                      setAmount(formatAssetAmountForInput(maxWithdrawRaw, contractDecimals, 'down'));
                    } else if (val > 0) {
                      setAmount(formatAssetAmountForInput(val, contractDecimals, 'down'));
                    } else {
                      setAmount('');
                    }
                  }
                }}
                placeholder="0.00"
                disabled={!isConnected || !currentVaultPosition}
                className={`w-full px-4 py-3 bg-[var(--background)] border rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  exceedsMaxWithdraw
                    ? 'border-[var(--danger)] focus:ring-[var(--danger)]'
                    : 'border-[var(--border-subtle)] focus:ring-[var(--primary)]'
                }`}
              />
              {exceedsMaxWithdraw && (
                <p className="text-xs text-[var(--danger)]">
                  Amount exceeds your available balance of {formatAssetAmountSafe(maxWithdrawRaw, {
                    decimals: vaultData.assetDecimals ?? 18,
                    symbol: vaultData.symbol,
                    roundMode: 'down',
                    trimZeros: true,
                  })} {vaultData.symbol}
                </p>
              )}
              {parseFloat(amount) > 0 && !exceedsMaxWithdraw && (
                <p className="text-xs text-[var(--foreground-secondary)]">
                  {assetPrice ? formatSmartCurrency(parseFloat(amount) * assetPrice) : '$0.00'}
                </p>
              )}
              <p className={`text-xs ${
                exceedsMaxWithdraw 
                  ? 'text-[var(--danger)]' 
                  : 'text-[var(--foreground-muted)]'
              }`}>
                {currentVaultPosition 
                  ? (currentAmount > 0
                      ? `${formatAssetAmountSafe(remainingWithdraw, {
                          decimals: vaultData.assetDecimals ?? 18,
                          symbol: vaultData.symbol,
                          roundMode: 'down',
                          trimZeros: true,
                        })} ${vaultData.symbol} remaining`
                      : `${formatAssetAmountSafe(maxWithdrawRaw, {
                          decimals: vaultData.assetDecimals ?? 18,
                          symbol: vaultData.symbol,
                          roundMode: 'down',
                          trimZeros: true,
                        })} ${vaultData.symbol} available`
                    )
                  : `0.00 ${vaultData.symbol} available`
                }
              </p>
            </div>

            {/* Position Info & Projections - Always Visible */}
            <div className="bg-[var(--surface-elevated)] rounded-lg p-4 space-y-3">
              {/* Current Deposits */}
              {isConnected && currentVaultPosition && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--foreground-secondary)]">Current Deposits</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    ${userVaultValueUsd.toFixed(4)}
                  </span>
                </div>
              )}

              {/* Interest Earned - Only show if positive (negative values are due to asset price changes, not actual negative interest) */}
              {isConnected && currentVaultPosition && userTransactions.length > 0 && calculateInterestEarned.totalInterest > 0 && (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 relative">
                    <span className="text-sm text-[var(--foreground-secondary)]">Interest Earned</span>
                    <div ref={interestBreakdownRef}>
                      <button
                        onClick={() => setShowInterestBreakdown(!showInterestBreakdown)}
                        className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
                        aria-label="Interest breakdown"
                      >
                        <span className="text-[10px] text-[var(--foreground-secondary)] font-semibold">i</span>
                      </button>
                      
                      {showInterestBreakdown && (
                        <div className="absolute top-full left-0 mt-2 z-10 bg-[var(--surface-elevated)] rounded-lg p-4 text-sm shadow-lg border border-[var(--border-subtle)] min-w-[200px]">
                          <div className="mb-3 pb-3 border-b border-[var(--border-subtle)]">
                            <span className="text-sm font-semibold text-[var(--foreground)]">Interest Breakdown</span>
                          </div>
                          <div className="space-y-2.5">
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[var(--foreground)]">Regular Interest</span>
                              <span className="text-[var(--foreground)] font-medium">
                                {formatSmartCurrency(calculateInterestEarned.regularInterest)}
                              </span>
                            </div>
                            
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[var(--foreground)]">
                                {vaultData.rewardSymbol || 'Morpho'} Rewards
                              </span>
                              <span className="text-[var(--foreground)] font-medium">
                                {formatSmartCurrency(calculateInterestEarned.rewardsInterest)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-[var(--success)]">
                    +{formatSmartCurrency(calculateInterestEarned.totalInterest)}
                  </span>
                </div>
              )}
              
              {/* APY Stats */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 relative">
                  <span className="text-sm text-[var(--foreground-secondary)]">APY</span>
                  <div ref={apyBreakdownRef}>
                    <button
                      onClick={() => setShowApyBreakdown(!showApyBreakdown)}
                      className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
                      aria-label="APY breakdown"
                    >
                      <span className="text-[10px] text-[var(--foreground-secondary)] font-semibold">i</span>
                    </button>
                    
                    {showApyBreakdown && (
                      <div className="absolute top-full left-0 mt-2 z-10 bg-[var(--surface-elevated)] rounded-lg p-4 text-sm shadow-lg border border-[var(--border-subtle)] min-w-[200px]">
                        <div className="mb-3 pb-3 border-b border-[var(--border-subtle)]">
                          <span className="text-sm font-semibold text-[var(--foreground)]">APY Breakdown</span>
                        </div>
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[var(--foreground)]">{vaultData.symbol}</span>
                            <span className="text-[var(--foreground)] font-medium">
                              {((vaultData.netApyWithoutRewards || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[var(--foreground)]">
                              {vaultData.rewardSymbol || 'REWARDS'}
                            </span>
                            <span className="text-[var(--foreground)] font-medium">
                              {((vaultData.rewardsApr || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          
                          {vaultData.performanceFee !== undefined && vaultData.performanceFee > 0 && (
                            <div className="flex justify-between items-center gap-4">
                              <span className="text-[var(--foreground)]">
                                Perf. Fee ({vaultData.performanceFee.toFixed(0)}%)
                              </span>
                              <span className="text-[var(--foreground)] font-medium">
                                -{(((vaultData.netApyWithoutRewards || 0) + (vaultData.rewardsApr || 0)) * (vaultData.performanceFee / 100) * 100).toFixed(2)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {(vaultData.apy * 100).toFixed(2)}%
                </span>
              </div>
              
              {/* Interest - Always Visible with Comparison */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--foreground-secondary)]">Monthly interest</span>
                <div className="flex items-center gap-2">
                  {enteredAmount > 0 ? (
                    <>
                      <span className="text-sm font-medium text-[var(--foreground-muted)]">
                        {formatSmartCurrency(oldMonthlyInterest)}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-[var(--foreground-secondary)]"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {formatSmartCurrency(newMonthlyInterest)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {formatSmartCurrency(monthlyInterest)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--foreground-secondary)]">Yearly interest</span>
                <div className="flex items-center gap-2">
                  {enteredAmount > 0 ? (
                    <>
                      <span className="text-sm font-medium text-[var(--foreground-muted)]">
                        {formatSmartCurrency(oldYearlyInterest)}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-[var(--foreground-secondary)]"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {formatSmartCurrency(newYearlyInterest)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {formatSmartCurrency(yearlyInterest)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Withdraw Button */}
            <Button
              onClick={handleWithdraw}
              disabled={!isConnected || !currentVaultPosition || exceedsMaxWithdraw || currentAmount <= 0}
              variant="primary"
              size="lg"
              fullWidth
            >
              {!isConnected ? 'Connect wallet' : !currentVaultPosition ? 'No holdings' : exceedsMaxWithdraw ? 'Amount too high' : currentAmount <= 0 ? 'Enter amount' : 'Withdraw'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

