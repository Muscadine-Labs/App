'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
const DEFAULT_HISTORY_PERIOD = '1y';

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
  }>>([]);

  // Find the current vault position
  const currentVaultPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData.address.toLowerCase()
  );

  // Extract stable values from currentVaultPosition for dependency tracking
  const currentShares = currentVaultPosition?.shares;
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
            `/api/vaults/${vaultData.address}/history?chainId=${vaultData.chainId}&period=${DEFAULT_HISTORY_PERIOD}`
          )
        ]);
        
        // Validate HTTP responses
        if (!userResponse.ok) {
          throw new Error(`Failed to fetch activity: ${userResponse.status} ${userResponse.statusText}`);
        }
        if (!historyResponse.ok) {
          throw new Error(`Failed to fetch history: ${historyResponse.status} ${historyResponse.statusText}`);
        }
        
        const userResponseData = await userResponse.json();
        // Type validation for JSON response
        if (!userResponseData || typeof userResponseData !== 'object') {
          throw new Error('Invalid activity response format');
        }
        setUserTransactions(Array.isArray(userResponseData.transactions) 
          ? userResponseData.transactions 
          : []);
        
        const historyData = await historyResponse.json();
        // Type validation for JSON response
        if (!historyData || typeof historyData !== 'object') {
          throw new Error('Invalid history response format');
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
          
          // Calculate historical share prices
          // sharePriceUsd = totalAssetsUsd / totalSupply
          // Since we don't have historical totalSupply, we estimate share price growth
          // by using the ratio of historical totalAssetsUsd to current totalAssetsUsd
          // This assumes share price grows proportionally to vault value
          const historicalData = historyData.history.map((point: { timestamp: number; totalAssetsUsd: number; totalAssets: number }) => {
            const totalAssetsDecimal = point.totalAssets || 0;
            
            // Calculate share price growth based on totalAssetsUsd growth
            // If current totalAssetsUsd is available, use ratio; otherwise use current share price
            let historicalSharePriceUsd = sharePriceUsd;
            if (currentTotalAssetsUsd > 0 && point.totalAssetsUsd > 0) {
              // Estimate share price based on how totalAssetsUsd changed
              // This approximates share price growth (assuming deposits/withdrawals don't drastically change the ratio)
              const growthRatio = point.totalAssetsUsd / currentTotalAssetsUsd;
              historicalSharePriceUsd = sharePriceUsd * growthRatio;
            }
            
            return {
              timestamp: point.timestamp,
              totalAssetsUsd: point.totalAssetsUsd,
              totalAssets: totalAssetsDecimal,
              sharePriceUsd: historicalSharePriceUsd,
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
  }, [vaultData.address, vaultData.chainId, address, currentShares, currentSharePriceUsd, currentTotalSupply, vaultData.totalValueLocked, vaultData.totalAssets, vaultData.assetDecimals, vaultData.sharePrice]);

  const formatDateShort = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateForChart = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Helper function to find closest historical data point for a given timestamp
  const findClosestHistoricalPoint = useCallback((timestamp: number) => {
    if (historicalVaultData.length === 0) return null;
    
    // Binary search for better performance on large datasets
    let left = 0;
    let right = historicalVaultData.length - 1;
    let closest = historicalVaultData[right];
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (historicalVaultData[mid].timestamp <= timestamp) {
        closest = historicalVaultData[mid];
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    return closest;
  }, [historicalVaultData]);

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

  // Calculate user's position history by working backwards from current position
  const calculateUserDepositHistory = () => {
    if (!address || userTransactions.length === 0) return [];

    const currentSharesWei = currentVaultPosition 
      ? BigInt(currentVaultPosition.shares) 
      : BigInt(0);
    
    const currentSharePriceUsd = currentVaultPosition 
      ? currentVaultPosition.vault.state.sharePriceUsd 
      : (vaultData.sharePrice || 1);
    
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
    
    const firstTx = sorted[sorted.length - 1];
    const firstTxDate = new Date(firstTx.timestamp * 1000);
    const today = new Date();
    
    const dailyData: Array<{ timestamp: number; date: string; valueUsd: number; valueToken: number }> = [];
    const currentDate = new Date(firstTxDate);
    currentDate.setHours(0, 0, 0, 0);
    const finalDate = new Date(today);
    finalDate.setHours(0, 0, 0, 0);
    
    while (currentDate <= finalDate) {
      const dayTimestamp = Math.floor(currentDate.getTime() / 1000);
      let sharesForDay = BigInt(0);
      let assetsForDay = BigInt(0);
      let foundTimestamp = -1;
      
      for (const [txTimestamp, shares] of sharesAtTimestamp.entries()) {
        if (txTimestamp <= dayTimestamp && txTimestamp > foundTimestamp) {
          foundTimestamp = txTimestamp;
          sharesForDay = shares;
          assetsForDay = assetsAtTimestamp.get(txTimestamp) || BigInt(0);
        }
      }
      
      if (foundTimestamp === -1) {
        if (dayTimestamp >= now) {
          sharesForDay = currentSharesWei;
          assetsForDay = currentAssetsWei;
        } else {
          sharesForDay = BigInt(0);
          assetsForDay = BigInt(0);
        }
      }
      
      const sharesDecimal = Number(sharesForDay) / WEI_PER_ETHER;
      
      // Find the closest historical share price for this day using helper function
      const closestHistoricalPoint = findClosestHistoricalPoint(dayTimestamp);
      const sharePriceUsdForDay = closestHistoricalPoint?.sharePriceUsd ?? currentSharePriceUsd;
      
      const positionValueUsd = sharesDecimal * sharePriceUsdForDay;
      
      // Calculate token value from tracked assets, or fallback to share price calculation
      let positionValueToken = 0;
      if (assetsForDay > BigInt(0)) {
        positionValueToken = Number(assetsForDay) / Math.pow(10, vaultData.assetDecimals || 18);
      } else if (sharePriceInAsset > 0 && sharesDecimal > 0) {
        // Use historical share price in asset terms if available
        if (closestHistoricalPoint) {
          // Calculate share price in asset terms from historical data with division by zero protection
          const assetPriceUsd = vaultData.sharePrice && closestHistoricalPoint.totalAssets > 0
            ? closestHistoricalPoint.totalAssetsUsd / closestHistoricalPoint.totalAssets
            : 1;
          const historicalSharePriceInAsset = assetPriceUsd > 0 && sharePriceUsdForDay > 0
            ? sharePriceUsdForDay / assetPriceUsd
            : sharePriceInAsset;
          positionValueToken = sharesDecimal * historicalSharePriceInAsset;
        } else {
          positionValueToken = sharesDecimal * sharePriceInAsset;
        }
      }
      
      dailyData.push({
        timestamp: dayTimestamp,
        date: formatDateShort(dayTimestamp),
        valueUsd: Math.max(0, positionValueUsd),
        valueToken: Math.max(0, positionValueToken),
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
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
    return data.map(item => ({
      ...item,
      value: valueType === 'usd' ? item.valueUsd : item.valueToken,
    }));
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Your Deposits</h2>
          <div className="flex items-center gap-6">
            <div className="text-right">
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
            {isConnected && (
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
            )}
          </div>
        </div>
        {!isConnected ? (
          <div className="bg-[var(--surface-elevated)] rounded-lg p-6 text-center">
            <p className="text-sm text-[var(--foreground-muted)]">
              Connect your wallet to view your position
            </p>
          </div>
        ) : !currentVaultPosition ? (
          <div className="bg-[var(--surface-elevated)] rounded-lg p-6 text-center">
            <p className="text-sm text-[var(--foreground-muted)]">
              No holdings in this vault
            </p>
          </div>
        ) : (
          <div>
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
          </div>
        )}
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
