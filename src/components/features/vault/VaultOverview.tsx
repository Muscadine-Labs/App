'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatSmartCurrency, formatAssetAmount } from '@/lib/formatter';
import { calculateYAxisDomain } from '@/lib/vault-utils';
import { MorphoVaultData } from '@/types/vault';
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
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'apy' | 'tvl'>('apy');
  const [valueType, setValueType] = useState<'usd' | 'token'>('usd');

  // Format liquidity
  const liquidityUsd = formatSmartCurrency(vaultData.currentLiquidity);
  const liquidityRaw = formatAssetAmount(
    BigInt(vaultData.totalAssets || '0'),
    vaultData.assetDecimals || 18,
    vaultData.symbol
  );

  // Format APY
  const apyPercent = (vaultData.apy * 100).toFixed(2);

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
        const data = await response.json();
        
        if (data.history && data.history.length > 0) {
          // Ensure timestamps are unique and sorted
          const uniqueData = data.history.filter((point: HistoryDataPoint, index: number, self: HistoryDataPoint[]) => 
            index === self.findIndex((p) => p.timestamp === point.timestamp)
          );
          setAllHistoryData(uniqueData);
        } else {
          setAllHistoryData([]);
        }
      } catch {
        setAllHistoryData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllHistory();
  }, [vaultData.address, vaultData.chainId]);

  // Filter history data based on selected period
  useEffect(() => {
    if (period === 'all' || allHistoryData.length === 0) {
      setHistoryData(allHistoryData);
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const cutoffTimestamp = now - PERIOD_SECONDS[period];
    
    setHistoryData(allHistoryData.filter(d => d.timestamp >= cutoffTimestamp));
  }, [allHistoryData, period]);

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
          <div>
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">Total Deposited</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {formatSmartCurrency(vaultData.totalValueLocked || 0, { alwaysTwoDecimals: true })}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              {formatAssetAmount(
                BigInt(vaultData.totalAssets || '0'),
                vaultData.assetDecimals || 18,
                vaultData.symbol
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">Liquidity</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {liquidityUsd}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              {liquidityRaw}
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
                      ticks={period === '7d' ? get7dTicks : period === '30d' ? get30dTicks : undefined}
                    />
                    <YAxis 
                      domain={apyYAxisDomain}
                      tickFormatter={(value) => `${value.toFixed(2)}%`}
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
                      formatter={(value: number) => [`${value.toFixed(2)}%`, 'APY']}
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
                          ticks={period === '7d' ? get7dTicks : period === '30d' ? get30dTicks : undefined}
                        />
                        <YAxis 
                          domain={tvlYAxisDomain}
                          tickFormatter={(value) => {
                            if (valueType === 'usd') {
                              return `$${(value / 1000).toFixed(2)}k`;
                            } else {
                              // Format token amount: use k format if >= 1000, otherwise show full value
                              if (value >= 1000) {
                                return `${(value / 1000).toFixed(2)}k`;
                              } else {
                                return value.toFixed(2);
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
                                return [`${valueInK.toFixed(2)}k ${vaultData.symbol || 'Token'}`, 'Total Deposits'];
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
