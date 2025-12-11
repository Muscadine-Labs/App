'use client';

import { useState, useEffect } from 'react';
import { MorphoVaultData } from '@/types/vault';
import CopiableAddress from '@/components/common/CopiableAddress';
import { formatSmartCurrency } from '@/lib/formatter';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface VaultSafetyProps {
  vaultData: MorphoVaultData;
}

interface AllocationHistoryPoint {
  timestamp: number;
  date: string;
  totalAssetsUsd: number;
  allocations: Record<string, { value: number; percentage: number; marketName?: string }>;
}

export default function VaultSafety({ vaultData }: VaultSafetyProps) {
  const [allocationHistory, setAllocationHistory] = useState<AllocationHistoryPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyPeriod, setHistoryPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('90d');
  const [historyUnit, setHistoryUnit] = useState<'percent' | 'asset'>('percent');

  // Format timelock duration in user-friendly way
  const formatTimelock = (seconds: number) => {
    if (seconds === 0) return 'None';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  // Calculate risk score (placeholder - will be calculated dynamically later)
  // For now, base it on available security features
  const calculateRiskScore = (type: 'owner' | 'guardian' | 'curator') => {
    // Placeholder scores - will be replaced with actual risk analysis
    const scores: Record<string, { score: number; max: number }> = {
      owner: { score: 3, max: 5 },
      guardian: { score: 2, max: 3 },
      curator: { score: 2, max: 3 },
    };
    return scores[type] || { score: 0, max: 5 };
  };

  const ownerScore = calculateRiskScore('owner');
  const guardianScore = calculateRiskScore('guardian');
  const curatorScore = calculateRiskScore('curator');

  const timelockDuration = vaultData.timelockDuration || 0;
  const curatorName = vaultData.curator || 'Unknown';

  // Fetch allocation history
  useEffect(() => {
    const fetchAllocationHistory = async () => {
      if (!vaultData.address || !vaultData.chainId) return;
      
      setLoadingHistory(true);
      try {
        const response = await fetch(
          `/api/vaults/${vaultData.address}/allocation-history?chainId=${vaultData.chainId}&period=${historyPeriod}`
        );
        
        if (!response.ok) {
          setAllocationHistory([]);
          return;
        }
        
        const data = await response.json();
        
        if (data.allocationHistory && data.allocationHistory.length > 0) {
          setAllocationHistory(data.allocationHistory);
        } else {
          setAllocationHistory([]);
        }
      } catch {
        setAllocationHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchAllocationHistory();
  }, [vaultData.address, vaultData.chainId, historyPeriod]);

  // Format date for chart
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (historyPeriod === '7d') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (historyPeriod === '30d') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
  };

  // Get all unique market keys (uniqueKeys) and create a mapping to display names
  const marketKeyToName = new Map<string, string>();
  const allMarketKeys = new Set<string>();
  
  allocationHistory.forEach((point) => {
    Object.entries(point.allocations).forEach(([key, alloc]) => {
      allMarketKeys.add(key);
      // Store the market name for this key (use first available)
      if (!marketKeyToName.has(key) && alloc.marketName) {
        marketKeyToName.set(key, alloc.marketName);
      }
    });
  });
  
  // Create display names: use marketName if available, otherwise use a shortened uniqueKey
  const marketKeys = Array.from(allMarketKeys);
  const marketDisplayNames = marketKeys.map((key) => {
    const marketName = marketKeyToName.get(key);
    if (marketName) {
      // If multiple markets have the same name, append a short identifier
      const otherKeysWithSameName = marketKeys.filter(k => 
        k !== key && marketKeyToName.get(k) === marketName
      );
      if (otherKeysWithSameName.length > 0) {
        return `${marketName} (${key.slice(-6)})`;
      }
      return marketName;
    }
    return key.slice(0, 8);
  });

  // Prepare chart data - ensure all markets are included in each data point
  const chartData = allocationHistory.map((point) => {
    const dataPoint: Record<string, string | number> = {
      date: point.date,
      timestamp: point.timestamp,
    };
    
    // Include all markets, even if they don't exist in this point (set to 0)
    marketKeys.forEach((marketKey, index) => {
      const alloc = point.allocations[marketKey];
      const displayName = marketDisplayNames[index];
      if (alloc) {
        if (historyUnit === 'percent') {
          dataPoint[displayName] = alloc.percentage;
        } else {
          dataPoint[displayName] = alloc.value;
        }
      } else {
        // Market doesn't exist in this point, set to 0
        dataPoint[displayName] = 0;
      }
    });
    
    return dataPoint;
  });

  // Get risk score color
  const getRiskScoreColor = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return 'text-[var(--success)]';
    if (percentage >= 60) return 'text-[var(--warning)]';
    return 'text-[var(--danger)]';
  };

  const getRiskScoreBg = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return 'bg-[var(--success-subtle)]';
    if (percentage >= 60) return 'bg-[var(--warning-subtle)]';
    return 'bg-[var(--danger-subtle)]';
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Safety & Security</h2>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Security analysis and risk assessment for this vault
        </p>
      </div>

      {/* Risk Disclosures */}
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-4">Risk Disclosures</h3>
        <div className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {/* Owner */}
          {vaultData.ownerAddress && (
            <div className="p-4 flex items-center justify-between hover:bg-[var(--background-elevated)] transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getRiskScoreBg(ownerScore.score, ownerScore.max)}`}>
                  <span className={`text-xs font-semibold ${getRiskScoreColor(ownerScore.score, ownerScore.max)}`}>
                    {ownerScore.score}/{ownerScore.max}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Owner</p>
                  <CopiableAddress address={vaultData.ownerAddress} truncateLength={6} className="text-xs text-[var(--foreground-secondary)] p-0 hover:bg-transparent" />
                </div>
              </div>
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
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          )}

          {/* Guardian */}
          {vaultData.guardianAddress && (
            <div className="p-4 flex items-center justify-between hover:bg-[var(--background-elevated)] transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getRiskScoreBg(guardianScore.score, guardianScore.max)}`}>
                  <span className={`text-xs font-semibold ${getRiskScoreColor(guardianScore.score, guardianScore.max)}`}>
                    {guardianScore.score}/{guardianScore.max}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Guardian</p>
                  <CopiableAddress address={vaultData.guardianAddress} truncateLength={6} className="text-xs text-[var(--foreground-secondary)] p-0 hover:bg-transparent" />
                </div>
              </div>
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
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          )}

          {/* Timelock Duration */}
          <div className="p-4 flex items-center justify-between hover:bg-[var(--background-elevated)] transition-colors">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Timelock Duration</p>
              <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{formatTimelock(timelockDuration)}</p>
            </div>
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
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          {/* Vault Deployment Date - Placeholder */}
          <div className="p-4 flex items-center justify-between hover:bg-[var(--background-elevated)] transition-colors">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Vault Deployment Date</p>
              <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
                {vaultData.lastUpdated ? new Date(vaultData.lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'N/A'}
              </p>
            </div>
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
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          {/* Curator */}
          <div className="p-4 flex items-center justify-between hover:bg-[var(--background-elevated)] transition-colors">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getRiskScoreBg(curatorScore.score, curatorScore.max)}`}>
                <span className={`text-xs font-semibold ${getRiskScoreColor(curatorScore.score, curatorScore.max)}`}>
                  {curatorScore.score}/{curatorScore.max}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Curator</p>
                <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{curatorName}</p>
              </div>
            </div>
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
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          {/* Morpho Vault Version - Placeholder */}
          <div className="p-4 flex items-center justify-between hover:bg-[var(--background-elevated)] transition-colors">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Morpho Vault Version</p>
              <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">v1.1</p>
            </div>
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
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          {/* Market Risk Disclosures */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-[var(--foreground)]">Market Risk Disclosures</p>
              <div className="w-4 h-4 rounded-full bg-[var(--primary-subtle)] text-[var(--primary)] flex items-center justify-center text-xs font-semibold">
                i
              </div>
            </div>
            <p className="text-xs text-[var(--foreground-secondary)]">
              Curator has not submitted a Disclosure.
            </p>
          </div>
        </div>
      </div>

      {/* Risk Curation */}
      {vaultData.allocators && vaultData.allocators.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-4">Risk Curation</h3>
          <div className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {vaultData.allocators.map((allocator, index) => (
              <div key={index} className="p-4 flex items-center justify-between hover:bg-[var(--background-elevated)] transition-colors">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Allocator Address</p>
                  <CopiableAddress address={allocator} truncateLength={6} className="text-xs text-[var(--foreground-secondary)] mt-0.5 p-0 hover:bg-transparent" />
                </div>
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
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allocation History */}
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-4">Allocation History</h3>
        <div className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] p-4">
          {/* Controls */}
          <div className="flex items-center gap-2 mb-4">
            <select
              value={historyUnit}
              onChange={(e) => setHistoryUnit(e.target.value as 'percent' | 'asset')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="percent">%</option>
              <option value="asset">{vaultData.symbol}</option>
            </select>
            <select
              value={historyPeriod}
              onChange={(e) => setHistoryPeriod(e.target.value as '7d' | '30d' | '90d' | '1y')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--background)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">3 months</option>
              <option value="1y">1 year</option>
            </select>
          </div>

          {/* Chart */}
          {loadingHistory ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
            </div>
          ) : chartData.length > 0 && marketDisplayNames.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    stroke="var(--foreground-secondary)"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    tickFormatter={(value) => {
                      if (historyUnit === 'percent') {
                        return `${value.toFixed(0)}%`;
                      }
                      return formatSmartCurrency(value);
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
                    labelFormatter={(label) => `Date: ${formatDate(label)}`}
                    formatter={(value: number, name: string) => [
                      historyUnit === 'percent' 
                        ? `${value.toFixed(2)}%` 
                        : formatSmartCurrency(value),
                      name
                    ]}
                  />
                  {marketDisplayNames.map((market, index) => {
                    const colors = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--primary-subtle)'];
                    const color = colors[index % colors.length];
                    return (
                      <Area
                        key={market}
                        type="monotone"
                        dataKey={market}
                        stackId="1"
                        stroke={color}
                        fill={color}
                        strokeWidth={1}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-[var(--foreground-muted)]">
              No allocation history available
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--foreground-muted)] mt-2 italic">
          Note: This chart shows allocation percentages applied to historical total assets. Actual allocation changes over time may vary.
        </p>
      </div>
    </div>
  );
}
