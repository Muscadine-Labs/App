'use client';

import { MorphoVaultData } from '@/types/vault';
import CopiableAddress from '@/components/common/CopiableAddress';

interface VaultRiskDisclosuresProps {
  vaultData: MorphoVaultData;
}

export default function VaultRiskDisclosures({ vaultData }: VaultRiskDisclosuresProps) {
  // Format timelock duration
  const formatTimelock = (seconds: number) => {
    if (seconds === 0) return 'None';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) {
      return `${days}D`;
    }
    return `${hours}H`;
  };

  // Format guardian/owner display
  const formatAddressDisplay = (address: string | undefined) => {
    if (!address) return 'N/A';
    if (address.startsWith('0x')) {
      return <CopiableAddress address={address} truncateLength={6} />;
    }
    return <span className="text-sm font-medium text-[var(--foreground)]">{address}</span>;
  };

  // Get deployment date (if available, otherwise use placeholder)
  const deploymentDate = vaultData.lastUpdated 
    ? new Date(vaultData.lastUpdated).toISOString().split('T')[0]
    : 'N/A';

  return (
    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6 space-y-6">
      <h2 className="text-lg font-semibold text-[var(--foreground)]">Risk Disclosures</h2>

      <div className="space-y-4">
        {/* Owner */}
        {vaultData.curatorAddress && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-[var(--foreground-secondary)]">Owner</span>
            <div className="flex items-center gap-2">
              {formatAddressDisplay(vaultData.curatorAddress)}
            </div>
          </div>
        )}

        {/* Timelock / Guardian */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--foreground-secondary)]">Timelock / Guardian</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">
              {formatTimelock(vaultData.timelockDuration || 0)}
            </span>
            {vaultData.guardianAddress && (
              <>
                <span className="text-[var(--foreground-secondary)]">/</span>
                {formatAddressDisplay(vaultData.guardianAddress)}
              </>
            )}
          </div>
        </div>

        {/* Vault Deployment Date */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--foreground-secondary)]">Vault Deployment Date</span>
          <span className="text-sm font-medium text-[var(--foreground)]">{deploymentDate}</span>
        </div>

        {/* Curator */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--foreground-secondary)]">Curator</span>
          <div className="flex items-center gap-2">
            {vaultData.curatorAddress ? (
              formatAddressDisplay(vaultData.curatorAddress)
            ) : (
              <span className="text-sm font-medium text-[var(--foreground)]">
                {vaultData.curator || 'N/A'}
              </span>
            )}
          </div>
        </div>

        {/* Morpho Vault Version */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-[var(--foreground-secondary)]">Morpho Vault Version</span>
          <span className="text-sm font-medium text-[var(--foreground)]">v1.1</span>
        </div>
      </div>

      {/* Market Risk Disclosures */}
      <div className="pt-4 border-t border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">
          Market Risk Disclosures
        </h3>
        <p className="text-sm text-[var(--foreground-muted)]">
          Curator has not submitted a Disclosure.
        </p>
      </div>

      {/* Risk Curation */}
      <div className="pt-4 border-t border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          Risk Curation
        </h3>
      </div>
    </div>
  );
}

