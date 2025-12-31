'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { MorphoVaultData } from '@/types/vault';
import { useWallet } from '@/contexts/WalletContext';
import { formatSmartCurrency, formatAssetAmount } from '@/lib/formatter';
import { calculateYAxisDomain } from '@/lib/vault-utils';
import { logger } from '@/lib/logger';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui';

// Constants
const WEI_PER_ETHER = 1e18;

interface VaultPositionProps {
  vaultData: MorphoVaultData;
}

interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'event';
  timestamp: number;
  blockNumber?: number;
  transactionHash?: string;
  user?: string;
  assets?: string;
  shares?: string;
  assetsUsd?: number;
}

type TimeFrame = 'all' | '1Y' | '90D' | '30D' | '7D';

const TIME_FRAME_SECONDS: Record<TimeFrame, number> = {
  all: 0, // 0 means all data
  '1Y': 365 * 24 * 60 * 60,
  '90D': 90 * 24 * 60 * 60,
  '30D': 30 * 24 * 60 * 60,
  '7D': 7 * 24 * 60 * 60,
};

export default function VaultPosition({ vaultData }: VaultPositionProps) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { morphoHoldings } = useWallet();
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrame>('all');
  const [valueType, setValueType] = useState<'usd' | 'token'>('usd');
  const [historicalVaultData, setHistoricalVaultData] = useState<Array<{
    timestamp: number;
    totalAssetsUsd: number;
    totalAssets: number;
    sharePriceUsd: number;
    assetPriceUsd?: number;
  }>>([]);
  const [assetPriceUsd, setAssetPriceUsd] = useState<number>(0);
  const [assetPriceFetched, setAssetPriceFetched] = useState(false);

  // Find the current vault position
  const currentVaultPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData.address.toLowerCase()
  );

  // Extract stable values from currentVaultPosition for dependency tracking
  const currentSharePriceUsd = currentVaultPosition?.vault.state.sharePriceUsd;
  const currentTotalSupply = currentVaultPosition?.vault.state.totalSupply;

  const userVaultValueUsd = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / WEI_PER_ETHER) * currentVaultPosition.vault.state.sharePriceUsd : 0;

  // Calculate asset amount from shares
  const userVaultAssetAmount = currentVaultPosition && vaultData.totalAssets && vaultData.totalValueLocked
    ? (() => {
        const sharesDecimal = parseFloat(currentVaultPosition.shares) / WEI_PER_ETHER;
        const totalSupplyDecimal = parseFloat(currentVaultPosition.vault.state.totalSupply) / WEI_PER_ETHER;
        const totalAssetsDecimal = parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18);
        const sharePriceInAsset = totalSupplyDecimal > 0 ? totalAssetsDecimal / totalSupplyDecimal : 0;
        return sharesDecimal * sharePriceInAsset;
      })()
    : 0;

  // Fetch asset price once when component mounts or vault changes
  useEffect(() => {
    if (assetPriceFetched || !vaultData.address) return;

    let cancelled = false;
    const fetchAssetPrice = async () => {
      try {
        const response = await fetch('https://api.morpho.org/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query VaultAssetPrice($address: String!, $chainId: Int!) {
                vaultByAddress(address: $address, chainId: $chainId) {
                  asset {
                    priceUsd
                  }
                }
              }
            `,
            variables: {
              address: vaultData.address,
              chainId: vaultData.chainId,
            },
          }),
        });

        if (cancelled) return;

        const data = await response.json().catch(() => ({}));
        const priceUsd = data.data?.vaultByAddress?.asset?.priceUsd || 0;
        
        if (!cancelled) {
          setAssetPriceUsd(priceUsd);
          setAssetPriceFetched(true);
        }
      } catch {
        if (!cancelled) {
          setAssetPriceUsd(0);
          setAssetPriceFetched(true);
        }
      }
    };

    fetchAssetPrice();
    return () => {
      cancelled = true;
    };
  }, [vaultData.address, vaultData.chainId, assetPriceFetched]);

  useEffect(() => {
    const fetchActivity = async () => {
      if (!address) {
        setUserTransactions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [userResponse, historyResponse] = await Promise.all([
          fetch(
            `/api/vaults/${vaultData.address}/activity?chainId=${vaultData.chainId}&userAddress=${address}`
          ),
          fetch(
            `/api/vaults/${vaultData.address}/history?chainId=${vaultData.chainId}&period=1y`
          )
        ]);
        
        // Parse responses even if status is not ok (API may return error in JSON body)
        const userResponseData = await userResponse.json().catch(() => ({}));
        const historyData = await historyResponse.json().catch(() => ({}));
        
        // Check for errors in response body (API returns 200 with error field for graceful errors)
        if (userResponseData.error) {
          logger.warn(
            'Activity API returned error',
            { 
              error: userResponseData.error,
              vaultAddress: vaultData.address, 
              userAddress: address 
            }
          );
        }
        if (historyData.error) {
          logger.warn(
            'History API returned error',
            { 
              error: historyData.error,
              vaultAddress: vaultData.address 
            }
          );
        }
        
        // Set transactions - use empty array if error or invalid response
        if (userResponseData && typeof userResponseData === 'object' && Array.isArray(userResponseData.transactions)) {
          setUserTransactions(userResponseData.transactions);
        } else {
          setUserTransactions([]);
        }
        
        if (historyData.history && Array.isArray(historyData.history) && historyData.history.length > 0) {
          // Calculate historical share prices from totalAssetsUsd and totalAssets
          // sharePriceUsd = totalAssetsUsd / totalSupply
          // We can estimate sharePriceUsd from totalAssetsUsd if we know the current ratio
          const totalSupplyDecimal = currentTotalSupply 
            ? parseFloat(currentTotalSupply) / WEI_PER_ETHER 
            : 0;
          const currentTotalAssetsUsd = vaultData.totalValueLocked || 0;
          const sharePriceUsd = currentSharePriceUsd 
            ? currentSharePriceUsd 
            : (totalSupplyDecimal > 0 && currentTotalAssetsUsd > 0 
                ? currentTotalAssetsUsd / totalSupplyDecimal 
                : 1);
          
          // Calculate historical share prices using actual historical asset prices
          // sharePriceUsd = totalAssetsUsd / totalSupply
          // Since we don't have historical totalSupply, we estimate share price growth
          // by using the ratio of historical totalAssetsUsd to current totalAssetsUsd
          // This assumes share price grows proportionally to vault value
          const historicalData = historyData.history.map((point: { 
            timestamp: number; 
            totalAssetsUsd: number; 
            totalAssets: number;
            assetPriceUsd?: number;
            sharePriceUsd?: number;
          }) => {
            const totalAssetsDecimal = point.totalAssets || 0;
            // Use sharePriceUsd from API if available (from GraphQL), otherwise fallback to calculation
            const historicalSharePriceUsd = point.sharePriceUsd || sharePriceUsd;
            const historicalAssetPriceUsd = point.assetPriceUsd || vaultData.sharePrice || 1;
            
            return {
              timestamp: point.timestamp,
              totalAssetsUsd: point.totalAssetsUsd,
              totalAssets: totalAssetsDecimal,
              sharePriceUsd: historicalSharePriceUsd,
              assetPriceUsd: historicalAssetPriceUsd,
            };
          });
          
          setHistoricalVaultData(historicalData);
        } else {
          setHistoricalVaultData([]);
        }
      } catch (error) {
        logger.error(
          'Failed to fetch vault position data',
          error instanceof Error ? error : new Error(String(error)),
          { vaultAddress: vaultData.address, userAddress: address, chainId: vaultData.chainId }
        );
        setUserTransactions([]);
        setHistoricalVaultData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [vaultData.address, vaultData.chainId, address, currentSharePriceUsd, currentTotalSupply, vaultData.sharePrice, vaultData.totalValueLocked]);

  // Calculate interest earned: Current Assets - (Total Deposits - Total Withdrawals)
  const interestEarned = useMemo(() => {
    if (!currentVaultPosition || !vaultData || assetPriceUsd === 0 || userTransactions.length === 0) {
      return { tokens: 0, usd: 0 };
    }

    // Get current assets in raw units
    let currentAssetsRaw = BigInt(0);
    let rawValue: number | null = null;
    
    // First priority: Use position.assets if available (from GraphQL)
    if (currentVaultPosition.assets) {
      rawValue = parseFloat(currentVaultPosition.assets) / Math.pow(10, vaultData.assetDecimals || 18);
    } else {
      // Second priority: Calculate from shares using share price
      const sharesDecimal = parseFloat(currentVaultPosition.shares) / WEI_PER_ETHER;
      
      if (vaultData.sharePrice && sharesDecimal > 0) {
        rawValue = sharesDecimal * vaultData.sharePrice;
      } else if (currentVaultPosition.vault?.state?.totalSupply && vaultData.totalAssets) {
        // Third priority: Calculate share price from totalAssets / totalSupply
        const totalSupplyDecimal = parseFloat(currentVaultPosition.vault.state.totalSupply) / WEI_PER_ETHER;
        const totalAssetsDecimal = parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18);
        
        if (totalSupplyDecimal > 0) {
          const sharePriceInAsset = totalAssetsDecimal / totalSupplyDecimal;
          rawValue = sharesDecimal * sharePriceInAsset;
        }
      }
    }

    // Convert to raw units
    if (rawValue !== null && !isNaN(rawValue) && rawValue > 0) {
      const assetDecimals = vaultData.assetDecimals || 18;
      currentAssetsRaw = BigInt(Math.floor(rawValue * Math.pow(10, assetDecimals)));
    }

    // If we can't determine current assets, return 0
    if (currentAssetsRaw === BigInt(0)) {
      return { tokens: 0, usd: 0 };
    }

    // Sum deposits and withdrawals
    let totalDepositsRaw = BigInt(0);
    let totalWithdrawalsRaw = BigInt(0);

    userTransactions.forEach(tx => {
      if (!tx.assets) return;
      
      try {
        const assetsRaw = BigInt(tx.assets);
        if (tx.type === 'deposit') {
          totalDepositsRaw += assetsRaw;
        } else if (tx.type === 'withdraw') {
          totalWithdrawalsRaw += assetsRaw;
        }
      } catch {
        // Skip invalid asset values
      }
    });

    // Calculate interest earned in raw units
    const netDeposits = totalDepositsRaw - totalWithdrawalsRaw;
    const interestRaw = currentAssetsRaw > netDeposits 
      ? currentAssetsRaw - netDeposits 
      : BigInt(0);

    // Convert to decimal
    const assetDecimals = vaultData.assetDecimals || 18;
    const interestTokens = Number(interestRaw) / Math.pow(10, assetDecimals);
    const interestUsd = interestTokens * assetPriceUsd;

    return {
      tokens: Math.max(0, interestTokens),
      usd: Math.max(0, interestUsd)
    };
  }, [currentVaultPosition, vaultData, userTransactions, assetPriceUsd]);

  const formatDateShort = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateForChart = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Calculate share price in asset terms (tokens per share)
  const sharePriceInAsset = useMemo(() => {
    // Calculate from totalAssets/totalSupply (most accurate)
    if (currentVaultPosition && vaultData.totalAssets) {
      const totalSupplyDecimal = parseFloat(currentVaultPosition.vault.state.totalSupply) / WEI_PER_ETHER;
      const totalAssetsDecimal = parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18);
      
      if (totalSupplyDecimal > 0 && totalAssetsDecimal > 0) {
        const calculated = totalAssetsDecimal / totalSupplyDecimal;
        if (calculated > 0 && isFinite(calculated)) {
          return calculated;
        }
      }
    }
    
    // Fallback: use current position calculation
    if (currentVaultPosition && userVaultAssetAmount > 0) {
      const sharesDecimal = parseFloat(currentVaultPosition.shares) / WEI_PER_ETHER;
      if (sharesDecimal > 0) {
        const calculated = userVaultAssetAmount / sharesDecimal;
        if (calculated > 0 && isFinite(calculated)) {
          return calculated;
        }
      }
    }
    
    return 0;
  }, [currentVaultPosition, vaultData.totalAssets, vaultData.assetDecimals, userVaultAssetAmount]);

  // Calculate user's position history using actual GraphQL data points
  const calculateUserDepositHistory = () => {
    // Always use GraphQL data points, even if user has no transactions yet
    if (historicalVaultData.length === 0) return [];

    const currentSharesWei = currentVaultPosition 
      ? BigInt(currentVaultPosition.shares) 
      : BigInt(0);
    
    // Calculate current asset amount - use userVaultAssetAmount if available, otherwise calculate from shares
    const currentAssetsWei = (() => {
      if (userVaultAssetAmount > 0) {
        return BigInt(Math.floor(userVaultAssetAmount * Math.pow(10, vaultData.assetDecimals || 18)));
      }
      if (currentVaultPosition && sharePriceInAsset > 0) {
        const sharesDecimal = parseFloat(currentVaultPosition.shares) / WEI_PER_ETHER;
        const assetAmount = sharesDecimal * sharePriceInAsset;
        return BigInt(Math.floor(assetAmount * Math.pow(10, vaultData.assetDecimals || 18)));
      }
      return BigInt(0);
    })();
    
    // Build map of user's shares/assets at each transaction timestamp
    const sorted = [...userTransactions].sort((a, b) => b.timestamp - a.timestamp);
    const sharesAtTimestamp = new Map<number, bigint>();
    const assetsAtTimestamp = new Map<number, bigint>();
    
    const now = Math.floor(Date.now() / 1000);
    sharesAtTimestamp.set(now, currentSharesWei);
    assetsAtTimestamp.set(now, currentAssetsWei);
    
    let runningShares = currentSharesWei;
    let runningAssets = currentAssetsWei;
    
    for (const tx of sorted) {
      const txSharesWei = tx.shares ? BigInt(tx.shares) : BigInt(0);
      let txAssetsWei = tx.assets ? BigInt(tx.assets) : BigInt(0);
      
      // If assets not available in transaction, estimate from shares using current share price
      if (txAssetsWei === BigInt(0) && txSharesWei > BigInt(0) && sharePriceInAsset > 0) {
        const txSharesDecimal = Number(txSharesWei) / WEI_PER_ETHER;
        const estimatedAssets = txSharesDecimal * sharePriceInAsset;
        txAssetsWei = BigInt(Math.floor(estimatedAssets * Math.pow(10, vaultData.assetDecimals || 18)));
      }
      
      sharesAtTimestamp.set(tx.timestamp, runningShares);
      assetsAtTimestamp.set(tx.timestamp, runningAssets);
      
      if (tx.type === 'deposit') {
        runningShares = runningShares > txSharesWei ? runningShares - txSharesWei : BigInt(0);
        runningAssets = runningAssets > txAssetsWei ? runningAssets - txAssetsWei : BigInt(0);
      } else if (tx.type === 'withdraw') {
        runningShares = runningShares + txSharesWei;
        runningAssets = runningAssets + txAssetsWei;
      }
    }
    
    if (sorted.length > 0) {
      const oldestTx = sorted[sorted.length - 1];
      sharesAtTimestamp.set(oldestTx.timestamp - 1, runningShares);
      assetsAtTimestamp.set(oldestTx.timestamp - 1, runningAssets);
    }
    
    // Helper function to get user's shares/assets at a given timestamp
    const getUserPositionAtTimestamp = (timestamp: number): { shares: bigint; assets: bigint } => {
      let foundTimestamp = -1;
      let shares = BigInt(0);
      let assets = BigInt(0);
      
      for (const [txTimestamp, txShares] of sharesAtTimestamp.entries()) {
        if (txTimestamp <= timestamp && txTimestamp > foundTimestamp) {
          foundTimestamp = txTimestamp;
          shares = txShares;
          assets = assetsAtTimestamp.get(txTimestamp) || BigInt(0);
        }
      }
      
      if (foundTimestamp === -1) {
        if (timestamp >= now) {
          shares = currentSharesWei;
          assets = currentAssetsWei;
        } else {
          shares = BigInt(0);
          assets = BigInt(0);
        }
      }
      
      return { shares, assets };
    };
    
    // Use actual GraphQL data points - each point represents a daily snapshot
    const dailyData: Array<{ timestamp: number; date: string; valueUsd: number; valueToken: number }> = [];
    
    // Sort historical data by timestamp
    const sortedHistoricalData = [...historicalVaultData].sort((a, b) => a.timestamp - b.timestamp);
    
    for (const historicalPoint of sortedHistoricalData) {
      const { shares } = getUserPositionAtTimestamp(historicalPoint.timestamp);
      const sharesDecimal = Number(shares) / WEI_PER_ETHER;
      
      // Use the historical share price from GraphQL data
      const sharePriceUsdForDay = historicalPoint.sharePriceUsd;
      
      // Calculate USD value: shares * sharePriceUsd
      const positionValueUsd = sharesDecimal * sharePriceUsdForDay;
      
      // Calculate token value using historical share price in asset terms
      // Always calculate from shares × sharePriceInAsset to get daily updates
      let positionValueToken = 0;
      if (sharesDecimal > 0) {
        // Get historical asset price for this day
        const historicalAssetPriceUsd = historicalPoint.assetPriceUsd 
          || (historicalPoint.totalAssets > 0 && historicalPoint.totalAssetsUsd > 0
            ? historicalPoint.totalAssetsUsd / historicalPoint.totalAssets
            : vaultData.sharePrice || 1);
        
        if (historicalAssetPriceUsd > 0 && sharePriceUsdForDay > 0) {
          // sharePriceInAsset = sharePriceUsd / assetPriceUsd
          // This changes daily as sharePriceUsd and assetPriceUsd change
          const historicalSharePriceInAsset = sharePriceUsdForDay / historicalAssetPriceUsd;
          positionValueToken = sharesDecimal * historicalSharePriceInAsset;
        } else if (sharePriceInAsset > 0) {
          // Fallback to current share price in asset
          positionValueToken = sharesDecimal * sharePriceInAsset;
        }
      }
      
      dailyData.push({
        timestamp: historicalPoint.timestamp,
        date: formatDateShort(historicalPoint.timestamp),
        valueUsd: Math.max(0, positionValueUsd),
        valueToken: Math.max(0, positionValueToken),
      });
    }
    
    return dailyData;
  };

  const userDepositHistory = calculateUserDepositHistory();

  // Calculate available time frames based on data range
  const availableTimeFrames = useMemo(() => {
    if (userDepositHistory.length === 0) return ['all' as TimeFrame];
    
    const now = Math.floor(Date.now() / 1000);
    const oldestTimestamp = userDepositHistory[0]?.timestamp || now;
    const dataRangeSeconds = now - oldestTimestamp;
    
    const frames: TimeFrame[] = ['all'];
    
    // Only add time frames that are <= the available data range
    if (dataRangeSeconds >= TIME_FRAME_SECONDS['1Y']) {
      frames.push('1Y');
    }
    if (dataRangeSeconds >= TIME_FRAME_SECONDS['90D']) {
      frames.push('90D');
    }
    if (dataRangeSeconds >= TIME_FRAME_SECONDS['30D']) {
      frames.push('30D');
    }
    if (dataRangeSeconds >= TIME_FRAME_SECONDS['7D']) {
      frames.push('7D');
    }
    
    return frames;
  }, [userDepositHistory]);

  // Filter chart data based on selected time frame and map to correct value type
  const filteredChartData = useMemo(() => {
    let data = userDepositHistory;
    
    if (selectedTimeFrame !== 'all' && userDepositHistory.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      const cutoffTimestamp = now - TIME_FRAME_SECONDS[selectedTimeFrame];
      data = userDepositHistory.filter(d => d.timestamp >= cutoffTimestamp);
    }
    
    // Map to include the correct value based on valueType
    const mappedData = data.map(item => ({
      ...item,
      value: valueType === 'usd' ? item.valueUsd : item.valueToken,
    }));
    
    // Find the first index with a non-zero value
    const firstNonZeroIndex = mappedData.findIndex(item => item.value > 0);
    
    // If we found a non-zero value, start from that point
    // Otherwise, return all data (user might not have any position yet)
    if (firstNonZeroIndex >= 0) {
      return mappedData.slice(firstNonZeroIndex);
    }
    
    return mappedData;
  }, [userDepositHistory, selectedTimeFrame, valueType]);

  // Calculate Y-axis domain for better fit
  const yAxisDomain = useMemo(() => {
    if (filteredChartData.length === 0) return [0, 100];
    
    const values = filteredChartData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
    const domain = calculateYAxisDomain(values, {
      bottomPaddingPercent: 0.25,
      topPaddingPercent: 0.2,
      thresholdPercent: 0.02,
    });
    
    return domain || [0, 100];
  }, [filteredChartData]);

  // Get ticks for 30D period - every 2 days
  const get30DTicks = useMemo(() => {
    if (selectedTimeFrame !== '30D' || filteredChartData.length === 0) return undefined;
    
    const ticks: number[] = [];
    const seenDates = new Set<string>();
    let dayCount = 0;
    
    // Sort data by timestamp to ensure chronological order
    const sortedData = [...filteredChartData].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedData.forEach((point) => {
      const date = new Date(point.timestamp * 1000);
      const dateKey = date.toDateString();
      
      // Only add tick if we haven't seen this date before
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        // Add every other day (even dayCount: 0, 2, 4, 6...)
        if (dayCount % 2 === 0) {
          ticks.push(point.timestamp);
        }
        dayCount++;
      }
    });
    
    return ticks.length > 0 ? ticks : undefined;
  }, [selectedTimeFrame, filteredChartData]);

  const handleDeposit = () => {
    router.push(`/transactions?vault=${vaultData.address}&action=deposit`);
  };

  const handleWithdraw = () => {
    router.push(`/transactions?vault=${vaultData.address}&action=withdraw`);
  };

  // Format APY
  const apyPercent = (vaultData.apy * 100).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Position Value */}
      <div>
        <div className="flex items-start justify-between gap-6 mb-4">
          {/* Your Deposits */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Your Deposits</h2>
            {!isConnected ? (
              <p className="text-sm text-[var(--foreground-muted)]">Connect wallet</p>
            ) : !currentVaultPosition ? (
              <p className="text-sm text-[var(--foreground-muted)]">No holdings</p>
            ) : (
              <>
                <p className="text-4xl font-bold text-[var(--foreground)]">
                  {formatAssetAmount(
                    BigInt(Math.floor(userVaultAssetAmount * Math.pow(10, vaultData.assetDecimals || 18))),
                    vaultData.assetDecimals || 18,
                    vaultData.symbol
                  )}
                </p>
                <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                  {formatSmartCurrency(userVaultValueUsd)}
                </p>
              </>
            )}
          </div>

          {/* Interest Earned */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Interest Earned</h2>
            {!isConnected || !currentVaultPosition ? (
              <>
                <p className="text-4xl font-bold text-[var(--foreground)]">—</p>
              </>
            ) : (
              <>
                <p className="text-4xl font-bold text-[var(--foreground)]">
                  {formatSmartCurrency(interestEarned.usd)}
                </p>
                <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                  {formatAssetAmount(
                    BigInt(Math.floor(interestEarned.tokens * Math.pow(10, vaultData.assetDecimals || 18))),
                    vaultData.assetDecimals || 18,
                    vaultData.symbol
                  )}
                </p>
              </>
            )}
          </div>

          {/* Current Earnings Rate */}
          <div>
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">Current Earnings Rate</p>
            <p className="text-3xl font-bold text-[var(--foreground)]">
              {apyPercent}%
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              Annual return you can expect
            </p>
            {vaultData.apyChange !== undefined && vaultData.apyChange !== 0 && (
              <p className={`text-xs mt-2 ${vaultData.apyChange > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {vaultData.apyChange > 0 ? '↑' : '↓'} {Math.abs(vaultData.apyChange * 100).toFixed(2)}% from last period
              </p>
            )}
          </div>

          {/* Transaction Buttons */}
          {isConnected && (
            <div className="flex flex-col">
              <p className="text-lg font-semibold text-[var(--foreground)] mb-1">Transaction</p>
              <div className="flex gap-2">
                <Button
                  onClick={handleDeposit}
                  variant="primary"
                  size="sm"
                >
                  Deposit
                </Button>
                <Button
                  onClick={handleWithdraw}
                  variant="secondary"
                  size="sm"
                >
                  Withdraw
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      {isConnected && address && (
        <div>
          {loading ? (
            <div className="bg-[var(--surface-elevated)] rounded-lg p-6 text-center">
              <p className="text-sm text-[var(--foreground-muted)]">Loading chart data...</p>
            </div>
          ) : userDepositHistory.length > 0 ? (
            <div className="bg-[var(--surface-elevated)] rounded-lg p-4">
              {/* Controls Row */}
              <div className="flex items-center justify-between mb-4">
                {/* Time Frame Selector */}
                <div className="flex items-center gap-2">
                  {availableTimeFrames.map((timeFrame) => (
                    <Button
                      key={timeFrame}
                      onClick={() => setSelectedTimeFrame(timeFrame)}
                      variant={selectedTimeFrame === timeFrame ? 'primary' : 'ghost'}
                      size="sm"
                      className="min-w-[3rem]"
                    >
                      {timeFrame === 'all' ? 'All' : timeFrame}
                    </Button>
                  ))}
                </div>
                
                {/* Value Type Toggle */}
                <div className="flex items-center gap-2 bg-[var(--surface)] rounded-lg p-1">
                  <button
                    onClick={() => setValueType('usd')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      valueType === 'usd'
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    USD
                  </button>
                  <button
                    onClick={() => setValueType('token')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      valueType === 'token'
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {vaultData.symbol || 'Token'}
                  </button>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis 
                      dataKey="timestamp" 
                      tickFormatter={formatDateForChart}
                      stroke="var(--foreground-secondary)"
                      style={{ fontSize: '12px' }}
                      interval="preserveStartEnd"
                      ticks={selectedTimeFrame === '30D' ? get30DTicks : undefined}
                    />
                    <YAxis 
                      domain={yAxisDomain}
                      tickFormatter={(value) => {
                        if (valueType === 'usd') {
                          return `$${(value / 1000).toFixed(2)}k`;
                        } else {
                          // Format token amount
                          if (value >= 1000) {
                            return `${(value / 1000).toFixed(2)}k`;
                          }
                          return value.toFixed(2);
                        }
                      }}
                      stroke="var(--foreground-secondary)"
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => {
                        if (valueType === 'usd') {
                          return [formatSmartCurrency(value, { alwaysTwoDecimals: true }), 'Your Position'];
                        } else {
                          return [
                            formatAssetAmount(
                              BigInt(Math.floor(value * Math.pow(10, vaultData.assetDecimals || 18))),
                              vaultData.assetDecimals || 18,
                              vaultData.symbol
                            ),
                            'Your Position'
                          ];
                        }
                      }}
                      labelFormatter={(label) => {
                        const timestamp = typeof label === 'number' ? label : parseFloat(String(label));
                        return `Date: ${formatDateForChart(timestamp)}`;
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="var(--primary)" 
                      fill="var(--primary-subtle)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--primary)', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--surface-elevated)] rounded-lg p-6 text-center">
              <p className="text-sm text-[var(--foreground-muted)]">
                No deposit history available. Make your first deposit to see your position over time.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
