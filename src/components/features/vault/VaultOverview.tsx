'use client';

import { useState, useEffect } from 'react';
import { formatSmartCurrency, formatAssetAmount } from '@/lib/formatter';
import { MorphoVaultData } from '@/types/vault';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface VaultOverviewProps {
  vaultData: MorphoVaultData;
}

interface HistoryDataPoint {
  timestamp: number;
  date: string;
  totalAssetsUsd: number;
  apy: number;
}

export default function VaultOverview({ vaultData }: VaultOverviewProps) {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'apy' | 'tvl'>('apy');

  // Format liquidity
  const liquidityUsd = formatSmartCurrency(vaultData.currentLiquidity);
  const liquidityRaw = formatAssetAmount(
    BigInt(vaultData.totalAssets || '0'),
    vaultData.assetDecimals || 18,
    vaultData.symbol
  );

  // Format APY
  const apyPercent = (vaultData.apy * 100).toFixed(2);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/vaults/${vaultData.address}/history?chainId=${vaultData.chainId}&period=${period}`
        );
        const data = await response.json();
        
        if (data.history && data.history.length > 0) {
          // Ensure timestamps are unique and sorted
          const uniqueData = data.history.filter((point: HistoryDataPoint, index: number, self: HistoryDataPoint[]) => 
            index === self.findIndex((p) => p.timestamp === point.timestamp)
          );
          setHistoryData(uniqueData);
        } else {
          setHistoryData([]);
        }
      } catch {
        setHistoryData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [vaultData.address, vaultData.chainId, period]);

  // Get ticks for 7d period - only midnight and midday
  const get7dTicks = () => {
    if (period !== '7d' || historyData.length === 0) return undefined;
    
    const ticks: number[] = [];
    const seenDates = new Set<string>();
    
    historyData.forEach((point: HistoryDataPoint) => {
      const date = new Date(point.timestamp * 1000);
      const dateKey = date.toDateString();
      const hours = date.getHours();
      const minutes = date.getMinutes();
      
      // Add midnight tick (once per day)
      if (hours === 0 && minutes < 30 && !seenDates.has(dateKey)) {
        ticks.push(point.timestamp);
        seenDates.add(dateKey);
      }
      // Add midday tick
      else if (hours === 12 && minutes < 30) {
        ticks.push(point.timestamp);
      }
    });
    
    return ticks.length > 0 ? ticks : undefined;
  };

  // Get ticks for 30d period - only every other day
  const get30dTicks = () => {
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
  };

  // Format date for tooltip - always shows accurate date/time
  const formatTooltipDate = (timestamp: number | string) => {
    const date = typeof timestamp === 'number' 
      ? new Date(timestamp * 1000) 
      : new Date(timestamp);
    
    if (period === '7d') {
      // For 7 days, show date and time
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${dateStr}, ${timeStr}`;
    } else if (period === '30d') {
      // For 30 days, show month and day
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (period === '90d') {
      // For 90 days, show month and day
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // For 1 year, show month and day (no year)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Format date for chart X-axis labels - accepts timestamp in seconds
  const formatDate = (timestamp: number | string) => {
    // Handle both timestamp (number) and date string (for backwards compatibility)
    const date = typeof timestamp === 'number' 
      ? new Date(timestamp * 1000) 
      : new Date(timestamp);
    
    if (period === '7d') {
      // For 7 days, show date at midnight, time at midday
      const hours = date.getHours();
      const minutes = date.getMinutes();
      
      // At midnight (00:00) or very close to it, show the date
      if (hours === 0 && minutes < 30) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      // At midday (12:00) or very close to it, show the time
      else if (hours === 12 && minutes < 30) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      // For all other times, return empty string (no label)
      else {
        return '';
      }
    } else if (period === '30d') {
      // For 30 days, show month and day
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (period === '90d') {
      // For 90 days, show month and day
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // For 1 year, show month and day (no year)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };


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
              {formatSmartCurrency(vaultData.totalValueLocked || 0)}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              Total value in this vault
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

        {/* Period Selector */}
        <div className="flex gap-2">
          {(['7d', '30d', '90d', '1y'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === p
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--surface-elevated)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
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
                      ticks={period === '7d' ? get7dTicks() : period === '30d' ? get30dTicks() : undefined}
                    />
                    <YAxis 
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
                  <AreaChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis 
                      dataKey="timestamp" 
                      tickFormatter={formatDate}
                      stroke="var(--foreground-secondary)"
                      style={{ fontSize: '12px' }}
                      ticks={period === '7d' ? get7dTicks() : period === '30d' ? get30dTicks() : undefined}
                    />
                    <YAxis 
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
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
                      formatter={(value: number) => [formatSmartCurrency(value), 'Total Deposits']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="totalAssetsUsd" 
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
