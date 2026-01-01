'use client';

import { WalletOverview } from '@/components/features/wallet';
import VaultList from '@/components/features/vault/VaultList';
import { useVaultListPreloader } from '@/hooks/useVaultDataFetch';
import { VAULTS } from '@/lib/vaults';
import { Vault } from '@/types/vault';

export default function Home() {
  // Get vault list for preloading
  const vaults: Vault[] = Object.values(VAULTS).map((vault) => ({
    address: vault.address,
    name: vault.name,
    symbol: vault.symbol,
    chainId: vault.chainId,
  }));

  // Preload vault data when dashboard loads
  useVaultListPreloader(vaults);

  return (
    <div className="w-full bg-[var(--background)] h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 sm:gap-6 h-full p-4 sm:p-6 grid-rows-[auto_1fr] min-h-full">
          <div className="rounded-lg min-h-[120px] md:h-40">
            <WalletOverview />
          </div>
          <div className="rounded-lg h-full min-h-0">
            <div className="flex flex-col rounded-lg bg-[var(--surface)] justify-start items-center h-full w-full">
              <VaultList />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
