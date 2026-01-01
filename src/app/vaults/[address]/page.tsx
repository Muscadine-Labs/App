'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { findVaultByAddress } from '@/lib/vault-utils';
import { Vault } from '@/types/vault';
import { useVaultDataFetch } from '@/hooks/useVaultDataFetch';
import { useVaultListPreloader } from '@/hooks/useVaultDataFetch';
import { VAULTS } from '@/lib/vaults';
import VaultHero from '@/components/features/vault/VaultHero';
import VaultOverview from '@/components/features/vault/VaultOverview';
import VaultTabs from '@/components/features/vault/VaultTabs';
import VaultPosition from '@/components/features/vault/VaultPosition';
import VaultHistory from '@/components/features/vault/VaultHistory';

export default function VaultPage() {
  const params = useParams();
  const router = useRouter();
  const address = (params?.address as string) || '';
  const [activeTab, setActiveTab] = useState<string>('position');

  // Redirect safety tab to position if somehow accessed
  useEffect(() => {
    if (activeTab === 'safety') {
      setActiveTab('position');
    }
  }, [activeTab]);
  const [tabContentHeight, setTabContentHeight] = useState<string>('0px');
  const heroRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find vault by address
  const vault = findVaultByAddress(address);

  // Fetch vault data
  const { vaultData, isLoading, hasError, refetch } = useVaultDataFetch(vault);

  // Preload all vault data
  const vaults: Vault[] = Object.values(VAULTS).map((v) => ({
    address: v.address,
    name: v.name,
    symbol: v.symbol,
    chainId: v.chainId,
  }));
  useVaultListPreloader(vaults);

  // Calculate exact height for tab content area
  useEffect(() => {
    const calculateHeight = () => {
      if (!heroRef.current || !tabsRef.current || !containerRef.current) return;

      const navbarHeight = 72; // var(--navbar-height)
      const containerPadding = 48; // p-6 = 24px top + 24px bottom
      const sectionGaps = 24; // mb-6 = 24px
      const tabContentMargin = 0; // No margin needed since tabs have mb-6
      
      const heroHeight = heroRef.current.offsetHeight;
      const tabsHeight = tabsRef.current.offsetHeight;
      
      const availableHeight = window.innerHeight - navbarHeight - containerPadding - sectionGaps;
      const fixedHeights = heroHeight + tabsHeight + tabContentMargin;
      const calculatedHeight = availableHeight - fixedHeights;
      
      setTabContentHeight(`${Math.max(400, calculatedHeight)}px`);
    };

    // Calculate on mount and when tab changes
    calculateHeight();
    
    // Recalculate on window resize
    window.addEventListener('resize', calculateHeight);
    const resizeObserver = new ResizeObserver(calculateHeight);
    
    if (heroRef.current) resizeObserver.observe(heroRef.current);
    if (tabsRef.current) resizeObserver.observe(tabsRef.current);
    
    return () => {
      window.removeEventListener('resize', calculateHeight);
      resizeObserver.disconnect();
    };
  }, [activeTab, vaultData]);

  // Redirect to dashboard if vault not found
  useEffect(() => {
    if (!vault && address) {
      // Small delay to avoid flash of content
      const timer = setTimeout(() => {
        router.push('/');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [vault, address, router]);

  // Show loading state while redirecting or loading
  if (!vault || (isLoading && !vaultData)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
        <p className="text-[var(--foreground-muted)] text-sm mt-2">
          {!vault ? 'Vault not found. Redirecting...' : 'Loading vault data...'}
        </p>
      </div>
    );
  }

  // Show error state
  if (hasError && !vaultData) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <p className="text-[var(--danger)] text-sm mb-4">
          Failed to load vault data
        </p>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Show no data state
  if (!vaultData) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <p className="text-[var(--foreground-muted)] text-sm">
          No vault data available
        </p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="w-full bg-[var(--background)] flex flex-col overflow-hidden p-4 sm:p-6 md:p-8" 
      style={{ height: 'calc(100vh - var(--navbar-height))' }}
    >
      {/* Hero Section */}
      <div ref={heroRef} className="flex-shrink-0 mb-6">
        <VaultHero vaultData={vaultData} />
      </div>

      {/* Main Content */}
      <div className="flex flex-col w-full mx-auto flex-1 min-h-0">
        {/* Tab content */}
        <div className="flex flex-col flex-1 min-h-0">
          <div ref={tabsRef} className="flex-shrink-0 -mx-4 sm:-mx-6 md:mx-0">
            <VaultTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>

          {/* Tab Content - Scrollable */}
          <div 
            className="overflow-y-auto px-0 sm:px-2 md:px-6 tab-content-scroll"
            style={{ height: tabContentHeight }}
          >
            {activeTab === 'overview' && <VaultOverview vaultData={vaultData} />}
            {activeTab === 'position' && <VaultPosition vaultData={vaultData} />}
            {activeTab === 'history' && <VaultHistory vaultData={vaultData} />}
          </div>
        </div>
      </div>

    </div>
  );
}
