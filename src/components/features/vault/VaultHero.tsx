'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getVaultLogo } from '@/types/vault';
import { MorphoVaultData } from '@/types/vault';

interface VaultHeroProps {
  vaultData: MorphoVaultData;
}

export default function VaultHero({ vaultData }: VaultHeroProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(vaultData.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      // Silently fail if clipboard API is not available
    }
  };

  return (
    <div className="w-full relative">
      {/* Hero Section */}
      <div className="bg-[var(--background)]">
        <div className="flex items-center gap-4">
          {/* Vault Name and Asset */}
          <div className="flex flex-col">
            <h1 
              onClick={handleCopyAddress}
              className="text-5xl font-semibold text-[var(--foreground)] cursor-pointer hover:text-[var(--primary)] transition-colors duration-200 select-none"
              title={`Click to copy address: ${vaultData.address}`}
            >
              {vaultData.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center overflow-hidden">
                <Image 
                  src={getVaultLogo(vaultData.symbol)} 
                  alt={`${vaultData.symbol} logo`}
                  width={20}
                  height={20}
                  className={`w-full h-full object-contain ${
                    vaultData.symbol === 'WETH' ? 'scale-75' : ''
                  }`}
                />
              </div>
              <span className="text-base text-[var(--foreground-secondary)]">
                {vaultData.symbol}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Copied to clipboard notification */}
      {copied && (
        <div 
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
          style={{ animation: 'fadeInUp 0.2s ease-out' }}
        >
          <div className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg px-4 py-2 shadow-lg">
            <p className="text-sm font-medium text-[var(--success)]">
              Copied to clipboard
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

