'use client';

import { useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { VAULTS } from '@/lib/vaults';
import { getVaultRoute, findVaultByAddress } from '@/lib/vault-utils';
import { getVaultLogo } from '@/types/vault';
import Image from 'next/image';
import { useOnClickOutside } from '@/hooks/onClickOutside';
import { Button } from '../ui/Button';

interface VaultsDropdownProps {
  isActive?: boolean;
}

export function VaultsDropdown({ isActive }: VaultsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Close dropdown when clicking outside
  useOnClickOutside(dropdownRef, () => setIsOpen(false));

  // Get vaults from VAULTS
  const vaults = Object.values(VAULTS);

  // Check if we're currently on a vault page
  const currentVaultAddress = pathname?.startsWith('/vaults/') 
    ? pathname.split('/vaults/')[1]?.split('?')[0]
    : null;
  const currentVault = currentVaultAddress ? findVaultByAddress(currentVaultAddress) : null;

  const handleVaultClick = (address: string) => {
    router.push(getVaultRoute(address));
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="ghost"
        size="sm"
        className={`min-w-fit ${isActive || isOpen ? 'bg-[var(--surface-elevated)] text-[var(--foreground)]' : ''}`}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-sm">Vaults</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-3 h-3 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 border border-[var(--border-subtle)] rounded-lg shadow-lg z-[60] overflow-hidden" style={{ backgroundColor: 'var(--surface-elevated)', opacity: 1 }}>
          <div className="max-h-96 overflow-y-auto">
            {vaults.map((vault) => {
              const isCurrentVault = currentVault?.address.toLowerCase() === vault.address.toLowerCase();
              return (
                <button
                  key={vault.address}
                  onClick={() => handleVaultClick(vault.address)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors ${
                    isCurrentVault ? 'bg-[var(--primary-subtle)]' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
                    <Image
                      src={getVaultLogo(vault.symbol)}
                      alt={`${vault.symbol} logo`}
                      width={32}
                      height={32}
                      className={`w-full h-full object-contain ${
                        vault.symbol === 'WETH' ? 'scale-75' : ''
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--foreground)] truncate">
                      {vault.name}
                    </div>
                    <div className="text-xs text-[var(--foreground-secondary)]">
                      {vault.symbol}
                    </div>
                  </div>
                  {isCurrentVault && (
                    <div className="w-2 h-2 rounded-full bg-[var(--primary)] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

