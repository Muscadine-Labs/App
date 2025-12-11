'use client';

import { useState, useEffect } from 'react';
import { MorphoVaultData } from '@/types/vault';
import { formatSmartCurrency, formatAssetAmount } from '@/lib/formatter';
import { useAccount } from 'wagmi';
import CopiableAddress from '@/components/common/CopiableAddress';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface VaultActivityProps {
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

export default function VaultActivity({ vaultData }: VaultActivityProps) {
  const { address } = useAccount();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserOnly, setShowUserOnly] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      try {
        // Fetch all vault activity
        const allResponse = await fetch(
          `/api/vaults/${vaultData.address}/activity?chainId=${vaultData.chainId}`
        );
        const allData = await allResponse.json();
        
        // Fetch user-specific activity if connected
        let userData: Transaction[] = [];
        if (address) {
          const userResponse = await fetch(
            `/api/vaults/${vaultData.address}/activity?chainId=${vaultData.chainId}&userAddress=${address}`
          );
          const userResponseData = await userResponse.json();
          userData = userResponseData.transactions || [];
        }

        setTransactions(allData.transactions || []);
        setUserTransactions(userData);
      } catch {
        setTransactions([]);
        setUserTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [vaultData.address, vaultData.chainId, address]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getExplorerUrl = (txHash: string) => {
    return `https://basescan.org/tx/${txHash}`;
  };

  const displayTransactions = showUserOnly && address ? userTransactions : transactions;
  const recentTransactions = displayTransactions.slice(0, 20);

  // Calculate user's deposit history for chart with daily data points
  const calculateUserDepositHistory = () => {
    if (!address || userTransactions.length === 0) return [];

    const sorted = [...userTransactions].sort((a, b) => a.timestamp - b.timestamp);
    
    if (sorted.length === 0) return [];
    
    // Get date range
    const firstTxDate = new Date(sorted[0].timestamp * 1000);
    const lastTxDate = new Date(sorted[sorted.length - 1].timestamp * 1000);
    const today = new Date();
    const endDate = today > lastTxDate ? today : lastTxDate;
    
    // Create a map of transactions by date (YYYY-MM-DD)
    const transactionsByDate = new Map<string, { deposits: number; withdrawals: number }>();
    
    sorted.forEach(tx => {
      const txDate = new Date(tx.timestamp * 1000);
      const dateKey = txDate.toISOString().split('T')[0];
      
      if (!transactionsByDate.has(dateKey)) {
        transactionsByDate.set(dateKey, { deposits: 0, withdrawals: 0 });
      }
      
      const dayData = transactionsByDate.get(dateKey)!;
      if (tx.type === 'deposit') {
        dayData.deposits += tx.assetsUsd || 0;
      } else if (tx.type === 'withdraw') {
        dayData.withdrawals += tx.assetsUsd || 0;
      }
    });
    
    // Generate daily data points from first transaction to today
    const dailyData: Array<{ timestamp: number; date: string; value: number }> = [];
    let cumulative = 0;
    
    // Start from the first transaction date
    const currentDate = new Date(firstTxDate);
    currentDate.setHours(0, 0, 0, 0);
    
    // End at today or last transaction date, whichever is later
    const finalDate = new Date(endDate);
    finalDate.setHours(0, 0, 0, 0);
    
    while (currentDate <= finalDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayTransactions = transactionsByDate.get(dateKey);
      
      // Apply transactions for this day
      if (dayTransactions) {
        cumulative += dayTransactions.deposits;
        cumulative -= dayTransactions.withdrawals;
      }
      
      // Add data point for this day
      dailyData.push({
        timestamp: Math.floor(currentDate.getTime() / 1000),
        date: formatDateShort(Math.floor(currentDate.getTime() / 1000)),
        value: Math.max(0, cumulative),
      });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dailyData;
  };

  const userDepositHistory = calculateUserDepositHistory();

  return (
    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6 flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="flex items-center justify-between flex-shrink-0 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Activity</h2>
        </div>
        {address && (
          <button
            onClick={() => setShowUserOnly(!showUserOnly)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-[var(--surface-elevated)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            {showUserOnly ? 'Show All' : 'Show Mine'}
          </button>
        )}
      </div>

      {/* User Deposit Chart - Fixed */}
      {address && userDepositHistory.length > 0 && (
        <div className="flex-shrink-0 mb-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Your Deposit History</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={userDepositHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--foreground-secondary)"
                  style={{ fontSize: '12px' }}
                  interval="preserveStartEnd"
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
                  formatter={(value: number) => [formatSmartCurrency(value), 'Your Position']}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="var(--primary)" 
                  fill="var(--primary-subtle)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--primary)', r: 2, strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--primary)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Transaction List Header */}
      <div className="flex-shrink-0 mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {showUserOnly && address ? 'Your transactions' : 'Recent vault activity'}
        </h3>
      </div>

      {/* Transaction List - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 tab-content-scroll">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
          </div>
        ) : recentTransactions.length > 0 ? (
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <div
                key={tx.id || tx.transactionHash}
                className="flex items-center justify-between p-4 bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] hover:border-[var(--border)] transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-2 h-2 rounded-full ${
                    tx.type === 'deposit' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)] capitalize">
                        {tx.type}
                      </span>
                      {tx.assetsUsd !== undefined && tx.assetsUsd > 0 && (
                        <span className="text-sm text-[var(--foreground)] font-medium">
                          {formatSmartCurrency(tx.assetsUsd)}
                        </span>
                      )}
                      {tx.assetsUsd === 0 && tx.assets && (
                        <span className="text-sm text-[var(--foreground-muted)]">
                          {formatAssetAmount(BigInt(tx.assets), vaultData.assetDecimals || 18, vaultData.symbol)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-[var(--foreground-secondary)]">
                        {formatDate(tx.timestamp)}
                      </span>
                      {tx.user && (
                        <>
                          <span className="text-xs text-[var(--foreground-muted)]">•</span>
                          <CopiableAddress address={tx.user} truncateLength={4} />
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {tx.transactionHash && (
                  <a
                    href={getExplorerUrl(tx.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] ml-4"
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--foreground-muted)]">
              {showUserOnly && address 
                ? "You haven't made any transactions yet"
                : 'No recent activity'}
            </p>
          </div>
        )}

        {/* Export Button */}
        {address && userTransactions.length > 0 && (
          <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
            <button
              onClick={() => {
                // Create CSV export
                const csv = [
                  ['Date', 'Type', 'Amount (USD)', 'Transaction Hash'].join(','),
                  ...userTransactions.map(tx => [
                    formatDate(tx.timestamp),
                    tx.type,
                    tx.assetsUsd?.toFixed(2) || '0',
                    tx.transactionHash || '',
                  ].join(',')),
                ].join('\n');

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vault-activity-${vaultData.symbol}-${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 text-sm font-medium bg-[var(--surface-elevated)] text-[var(--foreground)] rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--background-elevated)] transition-colors"
            >
              Download Transaction History (CSV)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

