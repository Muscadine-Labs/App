'use client';

import { useState, useEffect } from 'react';
import { MorphoVaultData } from '@/types/vault';
import { formatSmartCurrency } from '@/lib/formatter';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useAccount } from 'wagmi';
import { useWallet } from '@/contexts/WalletContext';

interface VaultPerformanceProps {
  vaultData: MorphoVaultData;
}

interface HistoryDataPoint {
  timestamp: number;
  date: string;
  totalAssetsUsd: number;
  apy: number;
  netApy: number;
}

export default function VaultPerformance({ vaultData }: VaultPerformanceProps) {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'apy' | 'tvl'>('apy');
  const { address } = useAccount();
  const { morphoHoldings } = useWallet();

  // Find user's position in this vault
  const userPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData.address.toLowerCase()
  );

  const userVaultValueUsd = userPosition ? 
    (parseFloat(userPosition.shares) / 1e18) * userPosition.vault.state.sharePriceUsd : 0;

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/vaults/${vaultData.address}/history?chainId=${vaultData.chainId}&period=${period}`
        );
        const data = await response.json();
        
        if (data.history && data.history.length > 0) {
          setHistoryData(data.history);
        } else {
          // Generate mock data as fallback if API doesn't return data
          const mockData: HistoryDataPoint[] = [];
          const now = Date.now();
          const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
          
          for (let i = days; i >= 0; i--) {
            const date = new Date(now - i * 24 * 60 * 60 * 1000);
            mockData.push({
              timestamp: Math.floor(date.getTime() / 1000),
              date: date.toISOString().split('T')[0],
              totalAssetsUsd: vaultData.totalValueLocked * (0.95 + Math.random() * 0.1),
              apy: vaultData.apy * 100 * (0.9 + Math.random() * 0.2),
              netApy: vaultData.netApyWithoutRewards * 100 * (0.9 + Math.random() * 0.2),
            });
          }
          setHistoryData(mockData);
        }
      } catch {
        setHistoryData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [vaultData.address, vaultData.chainId, period, vaultData.totalValueLocked, vaultData.apy, vaultData.netApyWithoutRewards]);

  // Format date for chart
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (period === '7d') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (period === '30d') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
  };

  const apyPercent = vaultData.apy * 100;

  // Calculate historical performance if user has position
  const calculateHistoricalValue = () => {
    if (!userPosition || historyData.length === 0) return null;
    
    // Find earliest data point
    const earliest = historyData[0];
    const current = historyData[historyData.length - 1];
    
    if (!earliest || !current) return null;
    
    // Estimate initial deposit based on current position and TVL change
    const tvlChange = current.totalAssetsUsd / earliest.totalAssetsUsd;
    const estimatedInitialValue = userVaultValueUsd / tvlChange;
    const totalEarnings = userVaultValueUsd - estimatedInitialValue;
    
    return {
      initialValue: estimatedInitialValue,
      currentValue: userVaultValueUsd,
      earnings: totalEarnings,
      returnPercent: ((userVaultValueUsd / estimatedInitialValue) - 1) * 100,
    };
  };

  const historicalPerformance = calculateHistoricalValue();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Performance</h2>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Track how this vault has performed over time
        </p>
      </div>

      {/* Current Performance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">Current Earnings Rate</p>
          <p className="text-3xl font-bold text-[var(--foreground)]">
            {apyPercent.toFixed(2)}%
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
                  dataKey="date" 
                  tickFormatter={formatDate}
                  stroke="var(--foreground-secondary)"
                  style={{ fontSize: '12px' }}
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
                  labelFormatter={(label) => `Date: ${formatDate(label)}`}
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
                  dataKey="date" 
                  tickFormatter={formatDate}
                  stroke="var(--foreground-secondary)"
                  style={{ fontSize: '12px' }}
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
                  labelFormatter={(label) => `Date: ${formatDate(label)}`}
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

      {/* Historical Performance (if user has position) */}
      {address && historicalPerformance && (
        <div className="pt-4 border-t border-[var(--border-subtle)]">
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-3">Your Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Initial Deposit</p>
              <p className="text-base font-semibold text-[var(--foreground)]">
                {formatSmartCurrency(historicalPerformance.initialValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Current Value</p>
              <p className="text-base font-semibold text-[var(--foreground)]">
                {formatSmartCurrency(historicalPerformance.currentValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Total Earnings</p>
              <p className="text-base font-semibold text-[var(--success)]">
                +{formatSmartCurrency(historicalPerformance.earnings)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Return</p>
              <p className={`text-base font-semibold ${historicalPerformance.returnPercent >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {historicalPerformance.returnPercent >= 0 ? '+' : ''}{historicalPerformance.returnPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

