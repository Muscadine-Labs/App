'use client';

import { useState, useRef } from 'react';
import { formatSmartCurrency, formatAssetAmount } from '@/lib/formatter';
import { MorphoVaultData } from '@/types/vault';
import { useOnClickOutside } from '@/hooks/onClickOutside';

interface VaultStatGridProps {
  vaultData: MorphoVaultData;
}

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
  tooltip?: string;
  showApyBreakdown?: boolean;
  vaultData?: MorphoVaultData;
}

function StatCard({ label, value, subValue, tooltip, showApyBreakdown, vaultData }: StatCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdownRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(breakdownRef, () => setShowBreakdown(false));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 relative">
        <span className="text-sm text-[var(--foreground-secondary)]">{label}</span>
        {showApyBreakdown && vaultData ? (
          <div ref={breakdownRef}>
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
              aria-label="APY breakdown"
            >
              <span className="text-[10px] text-[var(--foreground-secondary)] font-semibold">i</span>
            </button>
            
            {showBreakdown && (
              <div className="absolute top-full right-0 mt-2 z-10 bg-[var(--surface-elevated)] rounded-lg p-4 text-sm shadow-lg border border-[var(--border-subtle)] min-w-[200px]">
                <div className="mb-3 pb-3 border-b border-[var(--border-subtle)]">
                  <span className="text-sm font-semibold text-[var(--foreground)]">APY Breakdown</span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-[var(--foreground)]">{vaultData.symbol}</span>
                    <span className="text-[var(--foreground)] font-medium">
                      {((vaultData.netApyWithoutRewards || 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-[var(--foreground)]">
                      {vaultData.rewardSymbol || 'REWARDS'}
                    </span>
                    <span className="text-[var(--foreground)] font-medium">
                      {((vaultData.rewardsApr || 0) * 100).toFixed(2)}%
                    </span>
                  </div>
                  
                  {vaultData.performanceFee !== undefined && vaultData.performanceFee > 0 && (
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-[var(--foreground)]">
                        Perf. Fee ({vaultData.performanceFee.toFixed(0)}%)
                      </span>
                      <span className="text-[var(--foreground)] font-medium">
                        -{(((vaultData.netApyWithoutRewards || 0) + (vaultData.rewardsApr || 0)) * (vaultData.performanceFee / 100) * 100).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : tooltip && (
          <button
            className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
            aria-label={tooltip}
            title={tooltip}
          >
            <span className="text-[10px] text-[var(--foreground-secondary)] font-semibold">i</span>
          </button>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-2xl font-bold text-[var(--foreground)]">{value}</span>
        {subValue && (
          <span className="text-sm text-[var(--foreground-secondary)]">{subValue}</span>
        )}
      </div>
    </div>
  );
}

export default function VaultStatGrid({ vaultData }: VaultStatGridProps) {
  // Format total deposits
  const totalDepositsUsd = formatSmartCurrency(vaultData.totalDeposits, { alwaysTwoDecimals: true });
  const totalDepositsRaw = formatAssetAmount(
    BigInt(vaultData.totalAssets || '0'),
    vaultData.assetDecimals || 18,
    vaultData.symbol
  );

  // Format liquidity
  const liquidityUsd = formatSmartCurrency(vaultData.currentLiquidity);
  const liquidityRaw = formatAssetAmount(
    BigInt(vaultData.totalAssets || '0'),
    vaultData.assetDecimals || 18,
    vaultData.symbol
  );

  // Format APY
  const apyPercent = (vaultData.apy * 100).toFixed(2);

  // Get exposure assets from marketAssets (preferred) or fallback to parsing allocatedMarkets
  const exposureAssets: Array<{ symbol: string; address?: string }> = vaultData.marketAssets && vaultData.marketAssets.length > 0
    ? vaultData.marketAssets
    : (vaultData.allocatedMarkets?.flatMap(market => {
        const parts = market.split('/');
        return parts.map(part => part.trim()).filter(Boolean).map(symbol => ({ symbol, address: undefined }));
      }).filter((asset, index, self) => 
        self.findIndex(a => a.symbol === asset.symbol) === index && asset.symbol
      ) || []);

  return (
    <div className="flex w-full justify-between mt-2">
      {/* Total Deposits */}
      <StatCard
        label="Total Deposits"
        value={totalDepositsRaw}
        subValue={totalDepositsUsd}
      />

      {/* Liquidity */}
      <StatCard
        label="Liquidity"
        value={liquidityRaw}
        subValue={liquidityUsd}
      />

      {/* Exposure */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-[var(--foreground-secondary)]">Exposure</span>
        <div className="flex items-center gap-2 flex-wrap">
          {exposureAssets.length > 0 ? (
            exposureAssets.map((asset, index) => (
              <span
                key={`${asset.symbol}-${index}`}
                className="text-sm text-[var(--foreground)] px-2 py-1 bg-[var(--surface-elevated)] rounded"
                title={asset.symbol}
              >
                {asset.symbol}
              </span>
            ))
          ) : (
            <span className="text-sm text-[var(--foreground-muted)]">No exposure data</span>
          )}
        </div>
      </div>

      {/* APY */}
      <StatCard
        label="APY"
        value={`${apyPercent}%`}
        icon={<span className="text-lg">✨</span>}
        showApyBreakdown={true}
        vaultData={vaultData}
      />
    </div>
  );
}

