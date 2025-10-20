import LeftDashboardSection from "@/components/LeftDashboardSection";
import WalletOverview from "./WalletOverview";
import { useState } from "react";
import VaultDetailed from "./VaultDetailed";
import { Vault } from "../types/vault";
import { useNavBar } from "@/contexts/NavBarContext";
import { useVaultListPreloader } from "@/hooks/useVaultDataFetch";
import { VAULTS } from "@/lib/vaults";

export default function Dashboard() {
    const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
    const { isCollapsed: isNavbarCollapsed } = useNavBar();

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
        <div className="w-full bg-[var(--background)] h-screen flex">
            {/* Main Dashboard Area - Scrollable */}
            <div className={`flex-1 overflow-y-auto transition-all duration-300`}>
                <div className={`grid gap-4 h-full ${isNavbarCollapsed ? 'p-4' : 'p-4'}`} style={{gridTemplateRows: 'auto 1fr'}}>
                    {/* Top Row - Fixed Height */}
                    <div className="rounded-lg h-40">
                        <WalletOverview />
                    </div>
                    
                    {/* Bottom Row - Two Columns */}
                    <div className="grid transition-all duration-300" style={{
                        gridTemplateColumns: selectedVault ? '2fr 1fr' : '1fr 0fr', gap: selectedVault ? '16px' : '0px'
                    }}>
                        {/* Left Column - Vault List */}
                        <div className="rounded-lg">
                            <LeftDashboardSection 
                                onVaultSelect={setSelectedVault}
                                selectedVaultAddress={selectedVault?.address}
                            />
                        </div>
                        
                        {/* Right Column - Vault Details with slide animation */}
                        <div className={`rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)] overflow-hidden transition-all duration-300 ${
                            selectedVault ? 'opacity-100 translate-x-0 p-4' : 'opacity-0 translate-x-full p-0'
                        }`}>
                            {selectedVault && <VaultDetailed selectedVault={selectedVault} />}
                        </div>
                    </div>
                </div>
            </div>  
        </div>
    );
}