'use client';

import Image from 'next/image';
import { getVaultLogo } from '@/types/vault';
import { MorphoVaultData } from '@/types/vault';

interface VaultHeroProps {
  vaultData: MorphoVaultData;
}

export default function VaultHero({ vaultData }: VaultHeroProps) {

  return (
    <div className="w-full">
      {/* Hero Section */}
      <div className="bg-[var(--background)]">
        <div className="flex items-center gap-4">
          {/* Vault Name and Asset */}
          <div className="flex flex-col">
            <h1 className="text-5xl font-semibold text-[var(--foreground)]">
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
    </div>
  );
}

