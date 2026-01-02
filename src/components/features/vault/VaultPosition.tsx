'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { MorphoVaultData } from '@/types/vault';
import { useWallet } from '@/contexts/WalletContext';
import { formatSmartCurrency, formatAssetAmount, formatPercentage, formatNumber, formatCurrency } from '@/lib/formatter';
import { calculateYAxisDomain, calculateCurrentAssetsRaw, resolveAssetPriceUsd } from '@/lib/vault-utils';
import { logger } from '@/lib/logger';
import { useToast } from '@/contexts/ToastContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';

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

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function VaultPosition({ vaultData }: VaultPositionProps) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { morphoHoldings } = useWallet();
  const { error: showErrorToast } = useToast();
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrame>('all');
  const [valueType, setValueType] = useState<'usd' | 'token'>('usd');
  const [isTimeFrameMenuOpen, setIsTimeFrameMenuOpen] = useState(false);
  const [historicalVaultData, setHistoricalVaultData] = useState<Array<{
    timestamp: number;
    totalAssetsUsd: number;
    totalAssets: number;
    sharePriceUsd: number;
    assetPriceUsd?: number;
  }>>([]);
  const [assetPriceUsd, setAssetPriceUsd] = useState<number>(0);
  const [assetDecimals, setAssetDecimals] = useState<number>(vaultData.assetDecimals || 18);

  // Find the current vault position
  const currentVaultPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData.address.toLowerCase()
  );

  // Extract stable values from currentVaultPosition for dependency tracking
  const currentSharePriceUsd = currentVaultPosition?.vault.state.sharePriceUsd;
  const currentTotalSupply = currentVaultPosition?.vault.state.totalSupply;

  const userVaultValueUsd = useMemo(() => {
    if (!currentVaultPosition) return 0;
    return (parseFloat(currentVaultPosition.shares) / WEI_PER_ETHER) * currentVaultPosition.vault.state.sharePriceUsd;
  }, [currentVaultPosition]);

  // Calculate asset amount from shares
  const userVaultAssetAmount = useMemo(() => {
    if (!currentVaultPosition || !vaultData.totalAssets || !vaultData.totalValueLocked) {
      return 0;
    }
    
    const sharesDecimal = parseFloat(currentVaultPosition.shares) / WEI_PER_ETHER;
    const totalSupplyDecimal = parseFloat(currentVaultPosition.vault.state.totalSupply) / WEI_PER_ETHER;
    const totalAssetsDecimal = parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18);
    const sharePriceInAsset = totalSupplyDecimal > 0 ? totalAssetsDecimal / totalSupplyDecimal : 0;
    
    return sharesDecimal * sharePriceInAsset;
  }, [currentVaultPosition, vaultData.totalAssets, vaultData.totalValueLocked, vaultData.assetDecimals]);

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

        // Update asset price/decimals from activity response when available
        const decimalsFromActivity = userResponseData.assetDecimals ?? vaultData.assetDecimals ?? 18;
        setAssetDecimals(decimalsFromActivity);

        const resolvedPrice = resolveAssetPriceUsd({
          quotedPriceUsd: userResponseData.assetPriceUsd,
          vaultData,
          assetDecimals: decimalsFromActivity,
          fallbackSharePriceUsd: currentVaultPosition?.vault.state?.sharePriceUsd,
        });
        setAssetPriceUsd(resolvedPrice);
        
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
        showErrorToast('Failed to load position data. Please refresh the page.', 5000);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [vaultData, address, currentSharePriceUsd, currentTotalSupply, currentVaultPosition?.vault.state?.sharePriceUsd]);

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
  const userDepositHistory = useMemo(() => {
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
      let positionValueToken = 0;
      if (sharesDecimal > 0) {
        // Get historical asset price for this day
        const historicalAssetPriceUsd = historicalPoint.assetPriceUsd 
          || (historicalPoint.totalAssets > 0 && historicalPoint.totalAssetsUsd > 0
            ? historicalPoint.totalAssetsUsd / historicalPoint.totalAssets
            : vaultData.sharePrice || 1);
        
        if (historicalAssetPriceUsd > 0 && sharePriceUsdForDay > 0) {
          // sharePriceInAsset = sharePriceUsd / assetPriceUsd
          const historicalSharePriceInAsset = sharePriceUsdForDay / historicalAssetPriceUsd;
          positionValueToken = sharesDecimal * historicalSharePriceInAsset;
        } else if (sharePriceInAsset > 0) {
          // Fallback to current share price in asset
          positionValueToken = sharesDecimal * sharePriceInAsset;
        }
      }
      
      dailyData.push({
        timestamp: historicalPoint.timestamp,
        date: formatDate(historicalPoint.timestamp),
        valueUsd: Math.max(0, positionValueUsd),
        valueToken: Math.max(0, positionValueToken),
      });
    }
    
    return dailyData;
  }, [historicalVaultData, currentVaultPosition, userVaultAssetAmount, sharePriceInAsset, userTransactions, vaultData.assetDecimals, vaultData.sharePrice]);

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

  // Helper function to calculate chart ticks based on time frame
  const getChartTicks = useMemo(() => {
    if (filteredChartData.length === 0) return undefined;
    
    // Sort data once for all operations
    const sortedData = [...filteredChartData].sort((a, b) => a.timestamp - b.timestamp);
    
    // Determine interval configuration based on selected time frame
    let dayInterval: number;
    
    if (selectedTimeFrame === '7D') {
      dayInterval = 1; // Every day
    } else if (selectedTimeFrame === '30D') {
      dayInterval = 2; // Every 2 days
    } else if (selectedTimeFrame === '90D') {
      dayInterval = 5; // Every 5 days
    } else if (selectedTimeFrame === '1Y') {
      dayInterval = 30; // Every 30 days
    } else {
      // Calculate dynamic interval based on data range for 'all'
      const firstTimestamp = sortedData[0].timestamp;
      const lastTimestamp = sortedData[sortedData.length - 1].timestamp;
      const totalDays = (lastTimestamp - firstTimestamp) / (24 * 60 * 60);
      
      // Determine interval based on total days
      if (totalDays > 365) {
        dayInterval = 30;
      } else if (totalDays > 180) {
        dayInterval = 12;
      } else if (totalDays > 90) {
        dayInterval = 10;
      } else if (totalDays > 60) {
        dayInterval = 7;
      } else if (totalDays > 30) {
        dayInterval = 5;
      } else {
        dayInterval = 3;
      }
    }
    
    // Generate ticks based on interval
    const ticks: number[] = [];
    const seenDates = new Set<string>();
    let dayCount = 0;
    
    sortedData.forEach((point) => {
      const date = new Date(point.timestamp * 1000);
      const dateKey = date.toDateString();
      
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        if (dayCount % dayInterval === 0) {
          ticks.push(point.timestamp);
        }
        dayCount++;
      }
    });
    
    return ticks.length > 0 ? ticks : undefined;
  }, [selectedTimeFrame, filteredChartData]);
  
  // Format APY
  const apyPercent = formatPercentage(vaultData.apy);

  const handleDeposit = () => {
    router.push(`/transactions?vault=${vaultData.address}&action=deposit`);
  };

  const handleWithdraw = () => {
    router.push(`/transactions?vault=${vaultData.address}&action=withdraw`);
  };


  return (
    <div className="space-y-6">
      {/* Position Value */}
      <div>
        <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-4">
          {/* Your Deposits */}
          <div className="flex-1 w-full md:w-auto">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Your Deposits</h2>
            {!isConnected ? (
              <p className="text-sm text-[var(--foreground-muted)]">Connect wallet</p>
            ) : !currentVaultPosition ? (
              <p className="text-sm text-[var(--foreground-muted)]">No holdings</p>
            ) : (
              <>
                <p className="text-3xl md:text-4xl font-bold text-[var(--foreground)]">
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

          {/* Transaction Buttons - Desktop: Show in second column */}
          {isConnected && (
            <div className="hidden md:flex gap-2">
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
          )}
        </div>
        
        {/* Transaction Buttons - Mobile: Show below deposits */}
        {isConnected && (
          <div className="flex md:hidden gap-2 mt-4">
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
        )}
      </div>

      {/* Chart */}
      {isConnected && address && (
        <div>
          {loading ? (
            <div className="bg-[var(--surface-elevated)] rounded-lg p-2 sm:p-4">
              {/* Controls Row Skeleton */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Skeleton width="3rem" height="2rem" />
                  <Skeleton width="3rem" height="2rem" />
                  <Skeleton width="3rem" height="2rem" />
                </div>
                <div className="flex items-center gap-2 bg-[var(--surface)] rounded-lg p-1">
                  <Skeleton width="3rem" height="2rem" />
                  <Skeleton width="4rem" height="2rem" />
                </div>
              </div>
              {/* Chart Skeleton */}
              <div className="h-80 p-4">
                <div className="h-full flex flex-col justify-between">
                  {/* Y-axis labels area */}
                  <div className="flex justify-between mb-2">
                    <Skeleton width="3rem" height="0.75rem" />
                    <Skeleton width="3rem" height="0.75rem" />
                  </div>
                  {/* Chart area with wave pattern */}
                  <div className="flex-1 flex items-end justify-between gap-1 px-2">
                    {[45, 52, 38, 60, 48, 55, 42, 58, 50, 47, 53, 40, 57, 45, 50, 48, 55, 42, 58, 45].map((heightPercent, index) => (
                      <Skeleton
                        key={index}
                        width="100%"
                        height={`${heightPercent}%`}
                        className="rounded-t"
                      />
                    ))}
                  </div>
                  {/* X-axis labels area */}
                  <div className="flex justify-between mt-2">
                    <Skeleton width="4rem" height="0.75rem" />
                    <Skeleton width="4rem" height="0.75rem" />
                  </div>
                </div>
              </div>
            </div>
          ) : userDepositHistory.length > 0 ? (
            <div className="bg-[var(--surface-elevated)] rounded-lg p-2 sm:p-4">
              {/* Controls Row */}
              <div className="flex items-center justify-between mb-4">
                {/* Time Frame Selector - Desktop: Buttons, Mobile: Hamburger Menu */}
                <div className="relative">
                  {/* Desktop: Show buttons */}
                  <div className="hidden md:flex items-center gap-2">
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

                  {/* Mobile: Hamburger Menu */}
                  <div className="md:hidden">
                    <button
                      onClick={() => setIsTimeFrameMenuOpen(!isTimeFrameMenuOpen)}
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <span className="text-sm font-medium text-[var(--foreground)]">
                        {selectedTimeFrame === 'all' ? 'All' : selectedTimeFrame}
                      </span>
                      <svg
                        className={`w-4 h-4 text-[var(--foreground-secondary)] transition-transform ${
                          isTimeFrameMenuOpen ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {isTimeFrameMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setIsTimeFrameMenuOpen(false)}
                        />
                        <div className="absolute left-0 top-full mt-2 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg shadow-lg z-20 min-w-[120px]">
                          {availableTimeFrames.map((timeFrame) => (
                            <button
                              key={timeFrame}
                              onClick={() => {
                                setSelectedTimeFrame(timeFrame);
                                setIsTimeFrameMenuOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                                selectedTimeFrame === timeFrame
                                  ? 'bg-[var(--primary-subtle)] text-[var(--primary)] font-medium'
                                  : 'text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                              }`}
                            >
                              {timeFrame === 'all' ? 'All' : timeFrame}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
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
                      tickFormatter={formatDate}
                      stroke="var(--foreground-secondary)"
                      style={{ fontSize: '12px' }}
                      interval="preserveStartEnd"
                      ticks={getChartTicks}
                    />
                    <YAxis 
                      domain={yAxisDomain}
                      tickFormatter={(value) => {
                        if (valueType === 'usd') {
                          return '$' + formatNumber(value / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'k';
                        } else {
                          // Format token amount
                          if (value >= 1000) {
                            return formatNumber(value / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'k';
                          }
                          return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                      formatter={(value) => {
                        if (value === undefined || typeof value !== 'number') return ['', 'Your Position'];
                        if (valueType === 'usd') {
                          return [formatCurrency(value), 'Your Position'];
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
                        return `Date: ${formatDate(timestamp)}`;
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
