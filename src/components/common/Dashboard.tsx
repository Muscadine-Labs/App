import React from "react";
import { LeftDashboardSection } from '.';
import { WalletOverview } from "../features/wallet";
import { useVaultListPreloader } from "@/hooks/useVaultDataFetch";
import { VAULTS } from "@/lib/vaults";
import { Vault } from "../../types/vault";

export default function Dashboard() {
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
            {/* Main Dashboard Area - Scrollable */}
            <div className="flex-1 overflow-y-auto">
                <div className="grid gap-6 h-full p-6 grid-rows-[auto_1fr] min-h-full">
                    {/* Top Row - Fixed Height */}
                    <div className="rounded-lg h-40">
                        <WalletOverview />
                    </div>
                    
                    {/* Bottom Row - Vault List (Full Width) */}
                    <div className="rounded-lg h-full">
                        <LeftDashboardSection />
                    </div>
                </div>
            </div>  
        </div>
    );
}