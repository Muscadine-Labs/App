'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { MorphoVaultData } from '@/types/vault';
import { useTransactionModal } from '@/contexts/TransactionModalContext';
import { useWallet } from '@/contexts/WalletContext';
import { formatSmartCurrency, formatAssetAmountSafe, formatAssetAmountForInput, getTokenDisplayPrecision } from '@/lib/formatter';
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

// Vault ABI to get asset address
const VAULT_ABI = [
  {
    inputs: [],
    name: 'asset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function VaultActionCard({ vaultData }: VaultActionCardProps) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState<string>('');
  const [assetPrice, setAssetPrice] = useState<number | null>(null);
  const [assetAddress, setAssetAddress] = useState<string | null>(null);
  const [assetBalance, setAssetBalance] = useState<string>('0.00');
  const [showApyBreakdown, setShowApyBreakdown] = useState(false);
  const apyBreakdownRef = useRef<HTMLDivElement>(null);
  const { isConnected, address } = useAccount();
  const { openTransactionModal } = useTransactionModal();
  const { morphoHoldings, tokenBalances } = useWallet();

  // Helper function to format asset amount for display using the generalized formatter
  // Rounds DOWN to ensure formatted value never exceeds the original (important for validation)
  const formatAssetAmount = (value: number): string => {
    return formatAssetAmountSafe(value, {
      decimals: vaultData.assetDecimals ?? 18,
      symbol: vaultData.symbol,
      roundMode: 'down',
      trimZeros: true,
    });
  };

  // Click outside to close APY breakdown
  useOnClickOutside(apyBreakdownRef, () => setShowApyBreakdown(false));

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
  const { data: ethBalance } = useBalance({
    address: address as `0x${string}`,
    query: { enabled: !!address && vaultData.symbol.toUpperCase() === 'WETH' },
  });

  // Get WETH token balance (for WETH vaults - need to sum with ETH)
  const { data: wethTokenBalance } = useReadContract({
    address: assetAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!assetAddress && !!address && vaultData.symbol.toUpperCase() === 'WETH' },
  });

  // Get ERC20 token balance (for non-WETH tokens)
  const { data: tokenBalance } = useReadContract({
    address: assetAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!assetAddress && !!address && vaultData.symbol.toUpperCase() !== 'WETH' },
  });

  // Calculate and format asset balance
  // Use formatAssetAmount to ensure consistency with MAX button and input formatting
  useEffect(() => {
    if (!isConnected || !address) {
      setAssetBalance('0.00');
      return;
    }

    const symbol = vaultData.symbol.toUpperCase();
    let balanceValue: number = 0;
    
    // For WETH, sum both ETH and WETH balances
    if (symbol === 'WETH') {
      let ethAmount = 0;
      let wethAmount = 0;
      
      if (ethBalance) {
        ethAmount = parseFloat(ethBalance.formatted);
      }
      
      if (wethTokenBalance && vaultData.assetDecimals !== undefined) {
        const wethDecimalValue = formatUnits(wethTokenBalance as bigint, vaultData.assetDecimals);
        wethAmount = parseFloat(wethDecimalValue);
      }
      
      balanceValue = ethAmount + wethAmount;
    }
    // For USDC, check wallet context first
    else if (symbol === 'USDC') {
      const usdcBalance = tokenBalances.find(tb => tb.symbol === 'USDC');
      if (usdcBalance) {
        balanceValue = parseFloat(usdcBalance.formatted);
      }
    }
    // For other tokens, use token balance from contract
    else if (tokenBalance && vaultData.assetDecimals !== undefined) {
      const decimalValue = formatUnits(tokenBalance as bigint, vaultData.assetDecimals);
      balanceValue = parseFloat(decimalValue);
    }

    // Use formatAssetAmount to ensure consistency with MAX button
    setAssetBalance(isNaN(balanceValue) || balanceValue <= 0 ? '0.00' : formatAssetAmount(balanceValue));
  }, [isConnected, address, ethBalance, wethTokenBalance, tokenBalance, tokenBalances, vaultData.symbol, vaultData.assetDecimals]);

  // Helper function to calculate max depositable amount by rounding DOWN the BigInt balance
  // This prevents attempting to deposit more than available due to rounding issues
  // Uses full asset decimals precision to avoid leaving trace amounts
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
      
      // Convert total to decimal representation
      const decimalValue = formatUnits(totalWei, decimals);
      const numValue = parseFloat(decimalValue);
      // Round down to ensure we never exceed the actual balance
      const precisionMultiplier = Math.pow(10, decimals);
      const roundedDown = Math.floor(numValue * precisionMultiplier) / precisionMultiplier;
      // Additional safety check: ensure we never return more than what formatUnits gives us
      return Math.min(roundedDown, numValue);
    }
    
    // For USDC, check wallet context first
    if (symbol === 'USDC') {
      const usdcBalance = tokenBalances.find(tb => tb.symbol === 'USDC');
      if (usdcBalance?.balance) {
        const decimals = usdcBalance.decimals || 6;
        // Use the exact decimal value from the contract (no extra rounding)
        return parseFloat(formatUnits(usdcBalance.balance, decimals));
      }
    }
    
    // For other tokens (like cbBTC), use token balance from contract
    if (tokenBalance && vaultData.assetDecimals !== undefined) {
      const decimals = vaultData.assetDecimals;
      // Work with BigInt directly to avoid floating point precision loss
      // The balance is already in the smallest unit (e.g., satoshis for BTC)
      // We just need to convert it to decimal representation
      const balanceBigInt = tokenBalance as bigint;
      const decimalValue = formatUnits(balanceBigInt, decimals);
      // Parse to float - this should preserve the value correctly
      // No need to round down here since we're working with the exact balance
      return parseFloat(decimalValue);
    }
    
    return 0;
  }, [ethBalance, wethTokenBalance, tokenBalance, tokenBalances, vaultData.symbol, vaultData.assetDecimals]);

  // Fetch asset price
  useEffect(() => {
    const fetchAssetPrice = async () => {
      try {
        // Map vault symbols to price API symbols (handle both original and uppercase)
        const symbolMap: Record<string, string> = {
          'cbBTC': 'BTC',
          'CBBTC': 'BTC', // uppercase version
          'CBTC': 'BTC',
          'WETH': 'ETH',
          'WBTC': 'BTC',
        };
        
        const vaultSymbol = vaultData.symbol.toUpperCase();
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
          // Default prices for stablecoins
          if (vaultSymbol === 'USDC' || vaultSymbol === 'USDT' || vaultSymbol === 'DAI') {
            setAssetPrice(1);
          } else {
            console.warn(`Price not found for ${vaultSymbol} (mapped to ${priceSymbol}), got:`, data);
            setAssetPrice(null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch asset price:', error);
        // Default prices for stablecoins
        const vaultSymbol = vaultData.symbol.toUpperCase();
        if (vaultSymbol === 'USDC' || vaultSymbol === 'USDT' || vaultSymbol === 'DAI') {
          setAssetPrice(1);
        } else {
          setAssetPrice(null);
        }
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

  // Calculate projected earnings in USD
  // For deposit: current deposits + entered amount (if any)
  // For withdraw: current deposits - entered amount (if any)
  const enteredAmount = parseFloat(amount) || 0;
  const enteredAmountUsd = assetPrice ? enteredAmount * assetPrice : 0;
  
  // Old interest (based on current deposits only) - in USD
  const apyPercent = vaultData.apy * 100;
  const oldYearlyInterest = userVaultValueUsd * (apyPercent / 100);
  const oldMonthlyInterest = oldYearlyInterest / 12;
  
  // New interest (based on current deposits +/- entered amount) - in USD
  let newDepositsUsd = userVaultValueUsd;
  if (activeTab === 'deposit' && enteredAmount > 0) {
    newDepositsUsd = userVaultValueUsd + enteredAmountUsd;
  } else if (activeTab === 'withdraw' && enteredAmount > 0) {
    newDepositsUsd = Math.max(0, userVaultValueUsd - enteredAmountUsd);
  }
  
  const newYearlyInterest = newDepositsUsd * (apyPercent / 100);
  const newMonthlyInterest = newYearlyInterest / 12;
  
  // Use new values for display, but we'll show comparison when amount is entered
  const yearlyInterest = enteredAmount > 0 ? newYearlyInterest : oldYearlyInterest;
  const monthlyInterest = enteredAmount > 0 ? newMonthlyInterest : oldMonthlyInterest;

  // Calculate max values and remaining balances
  // Use calculateMaxDepositable to ensure we never exceed actual balance due to rounding
  const maxDepositRaw = calculateMaxDepositable;
  
  // Get display precision for this token (uses display precision, not contract decimals)
  const symbol = vaultData.symbol.toUpperCase();
  const displayPrecision = getTokenDisplayPrecision(vaultData.symbol, vaultData.assetDecimals);
  
  // Round down maxDeposit to display precision to match what formatAssetAmount produces
  // This ensures the comparison uses the same precision as the formatted display value
  const precisionMultiplier = Math.pow(10, displayPrecision);
  const maxDeposit = Math.floor(maxDepositRaw * precisionMultiplier) / precisionMultiplier;
  
  // Convert withdrawable amount from USD to asset units
  const maxWithdrawRaw = assetPrice && userVaultValueUsd > 0 ? userVaultValueUsd / assetPrice : 0;
  // Round down maxWithdraw to display precision (don't convert through string)
  const maxWithdraw = Math.floor(maxWithdrawRaw * precisionMultiplier) / precisionMultiplier;
  
  // Parse current amount once, used throughout
  const currentAmount = parseFloat(amount) || 0;
  
  const remainingDeposit = Math.max(0, maxDeposit - currentAmount);
  // For withdraw, calculate remaining in asset units (not USD)
  const remainingWithdraw = Math.max(0, maxWithdraw - currentAmount);

  // Check if amount exceeds max (with small epsilon for floating-point precision)
  // Use a small tolerance to account for floating-point arithmetic errors
  const EPSILON = 1e-8; // Small value to handle floating-point precision issues
  const exceedsMaxDeposit = currentAmount > maxDeposit + EPSILON;
  const exceedsMaxWithdraw = currentAmount > maxWithdraw + EPSILON;

  const handleDeposit = () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    if (isDepositDisabled) {
      return;
    }

    // Ensure amount is a valid string
    const amountToPass = amount && amount.trim() ? amount.trim() : '';
    
    console.log('VaultActionCard - handleDeposit', {
      amount,
      amountType: typeof amount,
      amountToPass,
      currentAmount,
    });
    
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

    // Ensure amount is a valid string
    const amountToPass = amount && amount.trim() ? amount.trim() : '';
    
    console.log('VaultActionCard - handleWithdraw', {
      amount,
      amountType: typeof amount,
      amountToPass,
      currentAmount,
    });
    
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
  // Use formatAssetAmountForInput to preserve full precision for transaction parsing
  const setMaxAmount = (isDeposit: boolean) => {
    if (isDeposit) {
      // Format with full contract decimals precision (no trimming)
      // This ensures parseUnits can accurately reconstruct the exact amount
      setAmount(formatAssetAmountForInput(maxDepositRaw, vaultData.assetDecimals ?? 18, 'down'));
    } else {
      setAmount(formatAssetAmountForInput(maxWithdraw, vaultData.assetDecimals ?? 18, 'down'));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => setActiveTab('deposit')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'deposit'
              ? 'text-[var(--foreground)]'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          Deposit
          {activeTab === 'deposit' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'withdraw'
              ? 'text-[var(--foreground)]'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          Withdraw
          {activeTab === 'withdraw' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
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
                  } else if (val > maxDeposit + EPSILON) {
                    // Use formatAssetAmountForInput to preserve full precision for transaction parsing
                    setAmount(formatAssetAmountForInput(maxDeposit, vaultData.assetDecimals ?? 18, 'down'));
                  } else if (val > 0) {
                    // Format with full precision to ensure parseUnits can accurately reconstruct
                    setAmount(formatAssetAmountForInput(val, vaultData.assetDecimals ?? 18, 'down'));
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
                  ? `${formatAssetAmount(remainingDeposit)} ${vaultData.symbol} remaining`
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
                  {apyPercent.toFixed(2)}%
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
                    disabled={!isConnected || maxWithdraw === 0}
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
                    // Use formatAssetAmountForInput to preserve full precision for transaction parsing
                    if (val > maxWithdraw + EPSILON) {
                      setAmount(formatAssetAmountForInput(maxWithdraw, vaultData.assetDecimals ?? 18, 'down'));
                    } else if (val > 0) {
                      // Format with full precision to ensure parseUnits can accurately reconstruct
                      setAmount(formatAssetAmountForInput(val, vaultData.assetDecimals ?? 18, 'down'));
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
                  Amount exceeds your available balance of {formatAssetAmount(maxWithdraw)} {vaultData.symbol}
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
                      ? `${formatAssetAmount(remainingWithdraw)} ${vaultData.symbol} remaining`
                      : `${formatAssetAmount(maxWithdraw)} ${vaultData.symbol} available`
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
                  {apyPercent.toFixed(2)}%
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

