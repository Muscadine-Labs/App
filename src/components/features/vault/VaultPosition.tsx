'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { MorphoVaultData } from '@/types/vault';
import { useWallet } from '@/contexts/WalletContext';
import { formatSmartCurrency, formatAssetAmount } from '@/lib/formatter';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui';

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

export default function VaultPosition({ vaultData }: VaultPositionProps) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { morphoHoldings } = useWallet();
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Find the current vault position
  const currentVaultPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData.address.toLowerCase()
  );


  const userVaultValueUsd = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18) * currentVaultPosition.vault.state.sharePriceUsd : 0;

  // Calculate asset amount from shares
  const userVaultAssetAmount = currentVaultPosition && vaultData.totalAssets && vaultData.totalValueLocked
    ? (() => {
        const sharesDecimal = parseFloat(currentVaultPosition.shares) / 1e18;
        const totalSupplyDecimal = parseFloat(currentVaultPosition.vault.state.totalSupply) / 1e18;
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
        const userResponse = await fetch(
          `/api/vaults/${vaultData.address}/activity?chainId=${vaultData.chainId}&userAddress=${address}`
        );
        const userResponseData = await userResponse.json();
        setUserTransactions(userResponseData.transactions || []);
      } catch {
        setUserTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [vaultData.address, vaultData.chainId, address]);

  const formatDateShort = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Calculate user's position history by working backwards from current position
  const calculateUserDepositHistory = () => {
    if (!address || userTransactions.length === 0) return [];

    const currentSharesWei = currentVaultPosition 
      ? BigInt(currentVaultPosition.shares) 
      : BigInt(0);
    
    const currentSharePriceUsd = currentVaultPosition 
      ? currentVaultPosition.vault.state.sharePriceUsd 
      : (vaultData.sharePrice || 1);
    
    const sorted = [...userTransactions].sort((a, b) => b.timestamp - a.timestamp);
    const sharesAtTimestamp = new Map<number, bigint>();
    
    const now = Math.floor(Date.now() / 1000);
    sharesAtTimestamp.set(now, currentSharesWei);
    
    let runningShares = currentSharesWei;
    for (const tx of sorted) {
      const txSharesWei = tx.shares ? BigInt(tx.shares) : BigInt(0);
      sharesAtTimestamp.set(tx.timestamp, runningShares);
      
      if (tx.type === 'deposit') {
        runningShares = runningShares > txSharesWei ? runningShares - txSharesWei : BigInt(0);
      } else if (tx.type === 'withdraw') {
        runningShares = runningShares + txSharesWei;
      }
    }
    
    if (sorted.length > 0) {
      const oldestTx = sorted[sorted.length - 1];
      sharesAtTimestamp.set(oldestTx.timestamp - 1, runningShares);
    }
    
    const firstTx = sorted[sorted.length - 1];
    const firstTxDate = new Date(firstTx.timestamp * 1000);
    const today = new Date();
    
    const dailyData: Array<{ timestamp: number; date: string; value: number }> = [];
    const currentDate = new Date(firstTxDate);
    currentDate.setHours(0, 0, 0, 0);
    const finalDate = new Date(today);
    finalDate.setHours(0, 0, 0, 0);
    
    while (currentDate <= finalDate) {
      const dayTimestamp = Math.floor(currentDate.getTime() / 1000);
      let sharesForDay = BigInt(0);
      let foundTimestamp = -1;
      
      for (const [txTimestamp, shares] of sharesAtTimestamp.entries()) {
        if (txTimestamp <= dayTimestamp && txTimestamp > foundTimestamp) {
          foundTimestamp = txTimestamp;
          sharesForDay = shares;
        }
      }
      
      if (foundTimestamp === -1) {
        if (dayTimestamp >= now) {
          sharesForDay = currentSharesWei;
        } else {
          sharesForDay = BigInt(0);
        }
      }
      
      const sharesDecimal = Number(sharesForDay) / 1e18;
      const positionValueUsd = sharesDecimal * currentSharePriceUsd;
      
      dailyData.push({
        timestamp: dayTimestamp,
        date: formatDateShort(dayTimestamp),
        value: Math.max(0, positionValueUsd),
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dailyData;
  };

  const userDepositHistory = calculateUserDepositHistory();

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Your Deposits</h2>
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
              <div className="h-80">
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
