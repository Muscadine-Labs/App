'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatSmartCurrency, formatAssetAmount, formatPercentage, formatNumber, formatCurrency } from '@/lib/formatter';
import { calculateYAxisDomain } from '@/lib/vault-utils';
import { logger } from '@/lib/logger';
import { MorphoVaultData } from '@/types/vault';
import { useToast } from '@/contexts/ToastContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface VaultOverviewProps {
  vaultData: MorphoVaultData;
}

interface HistoryDataPoint {
  timestamp: number;
  date: string;
  totalAssetsUsd: number;
  totalAssets?: number;
  apy: number;
}

type Period = 'all' | '7d' | '30d' | '90d' | '1y';

const PERIOD_SECONDS: Record<Period, number> = {
  all: 0, // 0 means all data
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  '90d': 90 * 24 * 60 * 60,
  '1y': 365 * 24 * 60 * 60,
};

export default function VaultOverview({ vaultData }: VaultOverviewProps) {
  const [period, setPeriod] = useState<Period>('all');
  const [allHistoryData, setAllHistoryData] = useState<HistoryDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'apy' | 'tvl'>('apy');
  const [valueType, setValueType] = useState<'usd' | 'token'>('usd');
  const { error: showErrorToast } = useToast();

  // Format liquidity
  const liquidityUsd = formatSmartCurrency(vaultData.currentLiquidity);
  const liquidityRaw = formatAssetAmount(
    BigInt(vaultData.totalAssets || '0'),
    vaultData.assetDecimals || 18,
    vaultData.symbol
  );

  // Format APY
  const apyPercent = formatPercentage(vaultData.apy);

  // Filter history data based on selected period and find first non-zero value
  const historyData = useMemo(() => {
    let filtered = allHistoryData;
    
    if (period !== 'all' && allHistoryData.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      const cutoffTimestamp = now - PERIOD_SECONDS[period];
      filtered = allHistoryData.filter(d => d.timestamp >= cutoffTimestamp);
    }
    
    // Find the first non-zero value based on chart type
    // For APY chart, filter out zero APY values
    // For TVL chart, filter out zero totalAssetsUsd/totalAssets values
    if (filtered.length > 0) {
      let firstNonZeroIndex = -1;
      
      if (chartType === 'apy') {
        firstNonZeroIndex = filtered.findIndex(d => d.apy > 0);
      } else {
        firstNonZeroIndex = filtered.findIndex(d => 
          (valueType === 'usd' ? d.totalAssetsUsd : (d.totalAssets || 0)) > 0
        );
      }
      
      if (firstNonZeroIndex > 0) {
        filtered = filtered.slice(firstNonZeroIndex);
      }
    }
    
    return filtered;
  }, [allHistoryData, period, chartType, valueType]);

  // Calculate Y-axis domain for APY chart
  const apyYAxisDomain = useMemo(() => {
    if (historyData.length === 0 || chartType !== 'apy') return undefined;
    
    const apyValues = historyData.map(d => d.apy).filter(v => v !== null && v !== undefined && !isNaN(v));
    return calculateYAxisDomain(apyValues, {
      bottomPaddingPercent: 0.5,
      topPaddingPercent: 0.2,
      thresholdPercent: 0.01,
    });
  }, [historyData, chartType]);

  // Memoize chart data for TVL chart to avoid recalculating on every render
  const tvlChartData = useMemo(() => {
    if (chartType !== 'tvl') return [];
    return historyData.map(item => ({
      ...item,
      value: valueType === 'usd' ? item.totalAssetsUsd : (item.totalAssets || 0),
    }));
  }, [historyData, chartType, valueType]);

  // Calculate Y-axis domain for Total Deposits chart
  const tvlYAxisDomain = useMemo(() => {
    if (tvlChartData.length === 0 || chartType !== 'tvl') return undefined;
    
    const values = tvlChartData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
    
    return calculateYAxisDomain(values, {
      bottomPaddingPercent: 0.25,
      topPaddingPercent: 0.2,
      thresholdPercent: valueType === 'usd' ? 0.02 : undefined,
      filterPositiveOnly: true,
      tokenThreshold: valueType === 'token' ? 1000 : undefined,
    });
  }, [tvlChartData, chartType, valueType]);

  // Fetch all history data once, then filter based on period
  useEffect(() => {
    const fetchAllHistory = async () => {
      setLoading(true);
      try {
        // Always fetch 1y worth of data to get all available history
        const response = await fetch(
          `/api/vaults/${vaultData.address}/history?chainId=${vaultData.chainId}&period=1y`
        );
        
        // Validate HTTP response
        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Type validation for JSON response
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid history response format');
        }
        
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
          // Ensure timestamps are unique and sorted
          const uniqueData = data.history.filter((point: HistoryDataPoint, index: number, self: HistoryDataPoint[]) => 
            index === self.findIndex((p) => p.timestamp === point.timestamp)
          );
          setAllHistoryData(uniqueData);
        } else {
          setAllHistoryData([]);
        }
      } catch (error) {
        logger.error(
          'Failed to fetch vault history data',
          error instanceof Error ? error : new Error(String(error)),
          { vaultAddress: vaultData.address, chainId: vaultData.chainId }
        );
        setAllHistoryData([]);
        showErrorToast('Failed to load vault history. Please refresh the page.', 5000);
      } finally {
        setLoading(false);
      }
    };

    fetchAllHistory();
  }, [vaultData.address, vaultData.chainId]);

  // Calculate available periods based on data range
  const availablePeriods = useMemo(() => {
    if (allHistoryData.length === 0) return ['all' as Period];
    
    const now = Math.floor(Date.now() / 1000);
    const oldestTimestamp = allHistoryData[0]?.timestamp || now;
    const dataRangeSeconds = now - oldestTimestamp;
    
    const periods: Period[] = ['all'];
    
    // Only add periods that are <= the available data range
    if (dataRangeSeconds >= PERIOD_SECONDS['1y']) {
      periods.push('1y');
    }
    if (dataRangeSeconds >= PERIOD_SECONDS['90d']) {
      periods.push('90d');
    }
    if (dataRangeSeconds >= PERIOD_SECONDS['30d']) {
      periods.push('30d');
    }
    if (dataRangeSeconds >= PERIOD_SECONDS['7d']) {
      periods.push('7d');
    }
    
    return periods;
  }, [allHistoryData]);

  // Get ticks for 7d period - show every day, prefer midnight but fallback to first data point of day
  const get7dTicks = useMemo(() => {
    if (period !== '7d' || historyData.length === 0) return undefined;
    
    const ticks: number[] = [];
    const seenDates = new Set<string>();
    
    // Sort data by timestamp
    const sortedData = [...historyData].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedData.forEach((point: HistoryDataPoint) => {
      const date = new Date(point.timestamp * 1000);
      const dateKey = date.toDateString();
      const hours = date.getHours();
      
      // Add tick for each day - prefer midnight (00:00-02:00), otherwise use first point of the day
      if (!seenDates.has(dateKey)) {
        // If it's early morning (0-2 AM), use it as the tick
        if (hours >= 0 && hours < 2) {
          ticks.push(point.timestamp);
          seenDates.add(dateKey);
        }
      }
    });
    
    // If we don't have enough ticks, add first point of each day
    if (ticks.length < 3) {
      const dayTicks: number[] = [];
      const daySeen = new Set<string>();
      
      sortedData.forEach((point: HistoryDataPoint) => {
        const date = new Date(point.timestamp * 1000);
        const dateKey = date.toDateString();
        
        if (!daySeen.has(dateKey)) {
          dayTicks.push(point.timestamp);
          daySeen.add(dateKey);
        }
      });
      
      // Use every other day if we have too many points
      if (dayTicks.length > 7) {
        return dayTicks.filter((_, index) => index % 2 === 0);
      }
      
      return dayTicks.length > 0 ? dayTicks : undefined;
    }
    
    return ticks.length > 0 ? ticks : undefined;
  }, [period, historyData]);

  // Get ticks for 30d period - only every other day
  const get30dTicks = useMemo(() => {
    if (period !== '30d' || historyData.length === 0) return undefined;
    
    const ticks: number[] = [];
    const seenDates = new Set<string>();
    let dayCount = 0;
    
    // Sort data by timestamp to ensure chronological order
    const sortedData = [...historyData].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedData.forEach((point: HistoryDataPoint) => {
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
  }, [period, historyData]);

  // Get ticks for 90d period - show every 5 days
  const get90dTicks = useMemo(() => {
    if (period !== '90d' || historyData.length === 0) return undefined;
    
    const ticks: number[] = [];
    const seenDates = new Set<string>();
    let dayCount = 0;
    
    // Sort data by timestamp to ensure chronological order
    const sortedData = [...historyData].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedData.forEach((point: HistoryDataPoint) => {
      const date = new Date(point.timestamp * 1000);
      const dateKey = date.toDateString();
      
      // Only add tick if we haven't seen this date before
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        // Add every 5 days (dayCount: 0, 5, 10, 15...)
        if (dayCount % 5 === 0) {
          ticks.push(point.timestamp);
        }
        dayCount++;
      }
    });
    
    return ticks.length > 0 ? ticks : undefined;
  }, [period, historyData]);

  // Get ticks for "all" period - show at start of each year, plus dynamic intervals
  const getAllTicks = useMemo(() => {
    if (period !== 'all' || historyData.length === 0) return undefined;
    
    const ticks: number[] = [];
    const seenYears = new Set<string>();
    const yearTicks = new Set<number>();
    
    // Sort data by timestamp to ensure chronological order
    const sortedData = [...historyData].sort((a, b) => a.timestamp - b.timestamp);
    
    if (sortedData.length === 0) return undefined;
    
    // Calculate total time span in days
    const firstTimestamp = sortedData[0].timestamp;
    const lastTimestamp = sortedData[sortedData.length - 1].timestamp;
    const totalDays = (lastTimestamp - firstTimestamp) / (24 * 60 * 60);
    
    // Determine interval based on total days
    // For shorter spans (< 60 days), use 3-5 day intervals
    // For medium spans (60-180 days), use 5-10 day intervals
    // For longer spans (180-365 days), use 12 day intervals
    // For very long spans (> 365 days), use 15-30 day intervals
    let dayInterval = 3;
    if (totalDays > 365) {
      dayInterval = 30; // Every 30 days for very long spans
    } else if (totalDays > 180) {
      dayInterval = 12; // Every 12 days for long spans
    } else if (totalDays > 90) {
      dayInterval = 10; // Every 10 days for medium-long spans
    } else if (totalDays > 60) {
      dayInterval = 7; // Every 7 days for medium spans
    } else if (totalDays > 30) {
      dayInterval = 5; // Every 5 days for shorter spans
    } else {
      dayInterval = 3; // Every 3 days for very short spans
    }
    
    // First, collect all year boundary ticks
    sortedData.forEach((point: HistoryDataPoint) => {
      const date = new Date(point.timestamp * 1000);
      const year = date.getFullYear();
      const yearKey = `${year}`;
      
      // Always add tick at start of new year
      if (!seenYears.has(yearKey)) {
        ticks.push(point.timestamp);
        yearTicks.add(point.timestamp);
        seenYears.add(yearKey);
      }
    });
    
    // Then add regular interval ticks between year boundaries
    const seenDates = new Set<string>();
    let lastTickTimestamp = firstTimestamp;
    
    sortedData.forEach((point: HistoryDataPoint) => {
      const date = new Date(point.timestamp * 1000);
      const dateKey = date.toDateString();
      
      // Skip if already added as year boundary
      if (yearTicks.has(point.timestamp)) {
        return;
      }
      
      // Skip if we've seen this date before
      if (seenDates.has(dateKey)) {
        return;
      }
      
      // Calculate days since last tick
      const daysSinceLastTick = (point.timestamp - lastTickTimestamp) / (24 * 60 * 60);
      
      // Add tick if interval has passed
      if (daysSinceLastTick >= dayInterval) {
        ticks.push(point.timestamp);
        seenDates.add(dateKey);
        lastTickTimestamp = point.timestamp;
      }
    });
    
    // Sort all ticks by timestamp
    ticks.sort((a, b) => a - b);
    
    return ticks.length > 0 ? ticks : undefined;
  }, [period, historyData]);

  // Format date for tooltip - always shows accurate date/time
  const formatTooltipDate = useCallback((timestamp: number | string) => {
    const date = typeof timestamp === 'number' 
      ? new Date(timestamp * 1000) 
      : new Date(timestamp);
    
    if (period === '7d') {
      // For 7 days, show date and time
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${dateStr}, ${timeStr}`;
    } else {
      // For 30d, 90d, 1y, show month and day
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }, [period]);

  // Format date for chart X-axis labels - accepts timestamp in seconds
  const formatDate = useCallback((timestamp: number | string) => {
    // Handle both timestamp (number) and date string (for backwards compatibility)
    const date = typeof timestamp === 'number' 
      ? new Date(timestamp * 1000) 
      : new Date(timestamp);
    
    // All periods show month and day
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);


  return (
    <div className="space-y-8">
      {/* Performance Section */}
      <div className="space-y-8">
        {/* Current Performance */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">Current Earnings Rate</p>
            <p className="text-3xl font-bold text-[var(--foreground)]">
              {apyPercent}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              Annual return you can expect
            </p>
            {vaultData.apyChange !== undefined && vaultData.apyChange !== 0 && (
              <p className={`text-xs mt-2 ${vaultData.apyChange > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {vaultData.apyChange > 0 ? '↑' : '↓'} {formatPercentage(Math.abs(vaultData.apyChange))} from last period
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">Total Deposited</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {formatAssetAmount(
                BigInt(vaultData.totalAssets || '0'),
                vaultData.assetDecimals || 18,
                vaultData.symbol
              )}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              {formatSmartCurrency(vaultData.totalValueLocked || 0, { alwaysTwoDecimals: true })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">Liquidity</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {liquidityRaw}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              {liquidityUsd}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">Status</p>
            <p className={`text-xl font-bold ${
              vaultData.status === 'active' ? 'text-[var(--success)]' :
              vaultData.status === 'paused' ? 'text-[var(--warning)]' :
              'text-[var(--foreground-muted)]'
            }`}>
              {vaultData.status === 'active' ? 'Active' : vaultData.status === 'paused' ? 'Paused' : 'Deprecated'}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              {vaultData.status === 'active' ? 'Accepting deposits' : 'Not accepting deposits'}
            </p>
          </div>
        </div>

        {/* Chart Type Selector */}
        <div className="flex gap-2 border-b border-[var(--border-subtle)]">
          <button
            onClick={() => setChartType('apy')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              chartType === 'apy'
                ? 'text-[var(--foreground)]'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            APY
            {chartType === 'apy' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
            )}
          </button>
          <button
            onClick={() => setChartType('tvl')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              chartType === 'tvl'
                ? 'text-[var(--foreground)]'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Total Deposits
            {chartType === 'tvl' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
            )}
          </button>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between">
          {/* Period Selector */}
          <div className="flex gap-2">
            {availablePeriods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  period === p
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--surface-elevated)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {p === 'all' ? 'All' : p.toUpperCase()}
              </button>
            ))}
          </div>
          
          {/* Value Type Toggle - Only show for Total Deposits chart */}
          {chartType === 'tvl' && (
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
          )}
        </div>

        {/* Chart */}
        {loading ? (
          <div className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
          </div>
        ) : historyData.length > 0 ? (
          <div className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] p-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'apy' ? (
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis 
                      dataKey="timestamp" 
                      tickFormatter={formatDate}
                      stroke="var(--foreground-secondary)"
                      style={{ fontSize: '12px' }}
                      ticks={period === '7d' ? get7dTicks : period === '30d' ? get30dTicks : period === '90d' ? get90dTicks : period === 'all' ? getAllTicks : undefined}
                    />
                    <YAxis 
                      domain={apyYAxisDomain}
                      tickFormatter={(value) => formatPercentage(value / 100)}
                      stroke="var(--foreground-secondary)"
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                      }}
                      labelFormatter={(label) => {
                        const timestamp = typeof label === 'number' ? label : parseFloat(String(label));
                        return `Date: ${formatTooltipDate(timestamp)}`;
                      }}
                      formatter={(value: number) => [formatPercentage(value / 100), 'APY']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="apy" 
                      stroke="var(--primary)" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={tvlChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={formatDate}
                          stroke="var(--foreground-secondary)"
                          style={{ fontSize: '12px' }}
                          ticks={period === '7d' ? get7dTicks : period === '30d' ? get30dTicks : period === '90d' ? get90dTicks : period === 'all' ? getAllTicks : undefined}
                        />
                        <YAxis 
                          domain={tvlYAxisDomain}
                          tickFormatter={(value) => {
                            if (valueType === 'usd') {
                              return formatSmartCurrency(value / 1000).replace('$', '$').replace('K', 'k');
                            } else {
                              // Format token amount: use k format if >= 1000, otherwise show full value
                              if (value >= 1000) {
                                return formatNumber(value / 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'k';
                              } else {
                                return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                              }
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
                          labelFormatter={(label) => {
                            const timestamp = typeof label === 'number' ? label : parseFloat(String(label));
                            return `Date: ${formatTooltipDate(timestamp)}`;
                          }}
                          formatter={(value: number) => {
                            if (valueType === 'usd') {
                              return [formatSmartCurrency(value, { alwaysTwoDecimals: true }), 'Total Deposits'];
                            } else {
                              // Format token amount: use k format if >= 1000, otherwise show full value
                              if (value >= 1000) {
                                const valueInK = value / 1000;
                                return [formatNumber(valueInK, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + `k ${vaultData.symbol || 'Token'}`, 'Total Deposits'];
                              } else {
                                return [
                                  formatAssetAmount(
                                    BigInt(Math.floor(value * Math.pow(10, vaultData.assetDecimals || 18))),
                                    vaultData.assetDecimals || 18,
                                    vaultData.symbol
                                  ),
                                  'Total Deposits'
                                ];
                              }
                            }
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          stroke="var(--primary)" 
                          fill="var(--primary-subtle)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] h-64 flex items-center justify-center text-sm text-[var(--foreground-muted)]">
            No historical data available
          </div>
        )}

      </div>
    </div>
  );
}
