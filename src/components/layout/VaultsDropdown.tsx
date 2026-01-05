'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { VAULTS } from '@/lib/vaults';
import { getVaultRoute, findVaultByAddress } from '@/lib/vault-utils';
import { getVaultLogo } from '@/types/vault';
import { useVaultVersion } from '@/contexts/VaultVersionContext';
import Image from 'next/image';
import { Button } from '../ui/Button';

interface VaultsDropdownProps {
  isActive?: boolean;
  onVaultSelect?: () => void;
}

export function VaultsDropdown({ isActive, onVaultSelect }: VaultsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { version } = useVaultVersion();

  // Filter vaults based on selected version
  const vaults = useMemo(() => {
    const allVaults = Object.values(VAULTS);
    if (version === 'all') {
      return allVaults;
    }
    return allVaults.filter((vault) => vault.version === version);
  }, [version]);

  // Check if we're currently on a vault page (v1 or v2) - memoized for performance
  const currentVaultAddress = useMemo(() => {
    if (!pathname) return null;
    if (pathname.startsWith('/vault/v1/')) {
      return pathname.split('/vault/v1/')[1]?.split('?')[0] || null;
    }
    if (pathname.startsWith('/vault/v2/')) {
      return pathname.split('/vault/v2/')[1]?.split('?')[0] || null;
    }
    return null;
  }, [pathname]);

  const currentVault = useMemo(() => {
    return currentVaultAddress ? findVaultByAddress(currentVaultAddress) : null;
  }, [currentVaultAddress]);

  const handleVaultClick = useCallback((address: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent click from bubbling to click-outside handler
    router.push(getVaultRoute(address));
    setIsOpen(false);
    onVaultSelect?.();
  }, [router, onVaultSelect]);

  const handleToggleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // If already open (from hover), keep it open; otherwise open it
    if (!isOpen) {
      setIsOpen(true);
    }
  }, [isOpen]);

  return (
    <div 
      ref={dropdownRef} 
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={(e) => e.stopPropagation()} // Stop clicks from bubbling
    >
      <Button
        variant="ghost"
        size="sm"
        className={`min-w-fit hover:bg-transparent hover:text-[var(--primary)] transition-colors ${isActive ? 'text-[var(--primary)]' : ''}`}
        onClick={handleToggleClick}
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
        <>
          {/* Invisible bridge to prevent gap closing dropdown */}
          <div 
            className="absolute top-full left-0 w-full h-2 z-[60]"
            onMouseEnter={() => setIsOpen(true)}
          />
          <div 
            className="absolute top-full left-0 mt-2 w-64 border border-[var(--border-subtle)] rounded-lg shadow-lg z-[60] overflow-hidden" 
            style={{ backgroundColor: 'var(--surface-elevated)', opacity: 1 }}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
          >
          <div className="max-h-96 overflow-y-auto">
            {vaults.map((vault) => {
              const isCurrentVault = currentVault?.address.toLowerCase() === vault.address.toLowerCase();
              return (
                <button
                  key={vault.address}
                  onClick={(e) => handleVaultClick(vault.address, e)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${
                    isCurrentVault ? 'bg-[var(--primary-subtle)]' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
                    <Image
                      src={getVaultLogo(vault.symbol)}
                      alt={`${vault.symbol} logo`}
                      width={32}
                      height={32}
                      className={`object-contain ${
                        vault.symbol === 'WETH' ? 'scale-75' : ''
                      }`}
                      style={{ width: '100%', height: '100%' }}
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
        </>
      )}
    </div>
  );
}

