import React, { useState } from "react";
import { LeftDashboardSection } from './';
import { WalletOverview } from "../features/wallet";
import { VaultDetailed, VaultInteractionOverlay } from "../features/vault";
import { useTab } from "@/contexts/TabContext";
import { useVaultListPreloader } from "@/hooks/useVaultDataFetch";
import { VAULTS } from "@/lib/vaults";
import { Vault } from "../../types/vault";

export default function Dashboard() {
    const { selectedVault, setSelectedVault } = useTab();
    const [overlayVault, setOverlayVault] = useState<Vault | null>(null);
    const [isOverlayVisible, setIsOverlayVisible] = useState(false);

    // Get vault list for preloading
    const vaults: Vault[] = Object.values(VAULTS).map((vault) => ({
        address: vault.address,
        name: vault.name,
        symbol: vault.symbol,
        chainId: vault.chainId,
    }));

    // Preload vault data when dashboard loads
    useVaultListPreloader(vaults);

    const handleInteractVault = (vault: Vault) => {
        setOverlayVault(vault);
        setIsOverlayVisible(true);
    };

    const handleCloseOverlay = () => {
        setIsOverlayVisible(false);
        // Delay removing the overlay until animation completes
        setTimeout(() => {
            setOverlayVault(null);
        }, 500); // Match the animation duration
    };
    return (
        <div className="w-full bg-[var(--background)] h-full">
            {/* Main Dashboard Area - Scrollable */}
            <div className={`flex-1 overflow-y-auto transition-all duration-300`}>
                <div className={`grid gap-6 h-full p-6`} style={{gridTemplateRows: 'auto 1fr', minHeight: '100%'}}>
                    {/* Top Row - Fixed Height */}
                    <div className="rounded-lg h-40">
                        <WalletOverview />
                    </div>
                    
                    {/* Bottom Row - Two Columns */}
                    <div className="grid transition-all duration-300" style={{
                        gridTemplateColumns: selectedVault ? '2fr 1fr' : '1fr 0fr', gap: selectedVault ? '24px' : '0px'
                    }}>
                        {/* Left Column - Vault List */}
                        <div className="rounded-lg relative overflow-hidden h-full">
                            {/* Vault List - slides down when overlay is shown */}
                            <div className={`h-full transition-all duration-500 ease-in-out ${
                                isOverlayVisible ? 'opacity-0 -translate-y-full' : 'opacity-100 translate-y-0'
                            }`}>
                                <LeftDashboardSection 
                                    onVaultSelect={setSelectedVault}
                                    selectedVaultAddress={selectedVault?.address}
                                />
                            </div>
                            
                            {/* Vault Interaction Overlay - slides up from bottom */}
                            <div className={`absolute inset-0 h-full transition-all duration-500 ease-in-out ${
                                isOverlayVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full'
                            }`}>
                                {overlayVault && (
                                    <VaultInteractionOverlay 
                                        selectedVault={overlayVault} 
                                        onClose={handleCloseOverlay} 
                                    />
                                )}
                            </div>
                        </div>
                        
                        {/* Right Column - Vault Details with slide animation */}
                        <div className={`rounded-lg bg-[var(--surface)] border border-[var(--border-subtle)] overflow-hidden transition-all duration-300 ${
                            selectedVault ? 'opacity-100 translate-x-0 p-4' : 'opacity-0 translate-x-full p-0'
                        }`}>
                            {selectedVault && <VaultDetailed selectedVault={selectedVault} onInteractVault={handleInteractVault} />}
                        </div>
                    </div>
                </div>
            </div>  
        </div>
    );
}