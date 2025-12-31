'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { getVaultLogo } from '@/types/vault';
import { SelectedAsset } from '@/hooks/useTransactionState';
import { VAULTS } from '@/lib/vaults';
import { useVaultData } from '@/contexts/VaultDataContext';
import { useOnClickOutside } from '@/hooks/onClickOutside';

interface AssetSelectorProps {
  label: string;
  selectedAsset: SelectedAsset | null;
  onSelect: (asset: SelectedAsset | null) => void;
}

// Available assets from vaults
const AVAILABLE_ASSETS = [
  { symbol: 'USDC', decimals: 6 },
  { symbol: 'cbBTC', decimals: 8 },
  { symbol: 'WETH', decimals: 18 },
] as const;

export function AssetSelector({
  label,
  selectedAsset,
  onSelect,
}: AssetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const vaultDataContext = useVaultData();

  useOnClickOutside(dropdownRef, () => setIsOpen(false));

  // Build asset options with addresses from vaults
  const assetOptions: SelectedAsset[] = AVAILABLE_ASSETS.map((asset) => {
    // Find a vault that uses this asset to get the asset address
    const vault = Object.values(VAULTS).find((v) => v.symbol === asset.symbol);
    const vaultData = vault ? vaultDataContext.getVaultData(vault.address) : null;
    
    // For now, we'll use empty string - the actual asset address will be fetched during transaction
    // Or we can fetch it from the vault's asset() function
    return {
      symbol: asset.symbol,
      address: '', // Will be fetched from vault contract during transaction
      decimals: asset.decimals,
    };
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-2">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--border-subtle)] rounded-lg text-left flex items-center justify-between hover:border-[var(--primary)] transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedAsset ? (
            <>
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                <Image
                  src={getVaultLogo(selectedAsset.symbol)}
                  alt={selectedAsset.symbol}
                  width={32}
                  height={32}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--foreground)] truncate">
                  {selectedAsset.symbol}
                </div>
              </div>
            </>
          ) : (
            <span className="text-[var(--foreground-muted)]">Select asset</span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-[var(--foreground-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {assetOptions.map((asset, index) => {
            const isSelected = selectedAsset?.symbol === asset.symbol;

            return (
              <button
                key={`${asset.symbol}-${index}`}
                type="button"
                onClick={() => {
                  onSelect(asset);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--background)] transition-colors ${
                  isSelected ? 'bg-[var(--background)]' : ''
                } ${index > 0 ? 'border-t border-[var(--border-subtle)]' : ''}`}
              >
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                  <Image
                    src={getVaultLogo(asset.symbol)}
                    alt={asset.symbol}
                    width={32}
                    height={32}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-[var(--foreground)] truncate">
                    {asset.symbol}
                  </div>
                </div>
                {isSelected && (
                  <svg
                    className="w-5 h-5 text-[var(--primary)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

