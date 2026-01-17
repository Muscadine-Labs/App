import { VAULTS } from "@/lib/vaults";
import VaultListCard from "./VaultListCard";
import { Vault } from "../../../types/vault";
import { useWallet } from "../../../contexts/WalletContext";
import { useVaultVersion } from "../../../contexts/VaultVersionContext";
import { useMemo, useState } from "react";

interface VaultListProps {
    onVaultSelect?: (vault: Vault | null) => void;
    selectedVaultAddress?: string;
}

export default function VaultList({ onVaultSelect, selectedVaultAddress }: VaultListProps = {} as VaultListProps) {
    const { morphoHoldings } = useWallet();
    const { version } = useVaultVersion();
    // Use function initializer to avoid setState in effect
    const [isMounted] = useState(() => typeof window !== 'undefined');
    
    // Get base vault list (stable order for SSR - use 'v1' during SSR to prevent hydration mismatch)
    // After mount, use actual version from context
    const effectiveVersion = isMounted ? version : 'v1';
    const baseVaults = useMemo(() => {
        return Object.values(VAULTS)
            .filter((vault) => effectiveVersion === 'all' || vault.version === effectiveVersion)
            .map((vault) => ({
                address: vault.address,
                name: vault.name,
                symbol: vault.symbol,
                chainId: vault.chainId,
                version: vault.version,
            }));
    }, [effectiveVersion]);
    
    // Sort vaults by user position (highest to lowest) - only after mount to prevent hydration mismatch
    const sortedVaults = useMemo(() => {
        // Always return stable order during SSR/initial render (before mount)
        if (!isMounted) {
            return baseVaults;
        }
        
        // Only sort after mount when we have client-side data
        // Use positions length as additional check to ensure data is loaded
        if (!morphoHoldings.positions || morphoHoldings.positions.length === 0) {
            return baseVaults;
        }
        
        // Calculate position value for each vault and sort
        return [...baseVaults].sort((a, b) => {
            // Use RPC positions from WalletContext (already calculated with balanceOf + convertToAssets)
            const positionA = morphoHoldings.positions.find(
                pos => pos.vault.address.toLowerCase() === a.address.toLowerCase()
            );
            const positionB = morphoHoldings.positions.find(
                pos => pos.vault.address.toLowerCase() === b.address.toLowerCase()
            );
            
            // Use assetsUsd from RPC position (calculated from asset amount * price)
            const valueA = positionA && positionA.assetsUsd !== undefined && positionA.assetsUsd > 0
                ? positionA.assetsUsd
                : 0;
            
            const valueB = positionB && positionB.assetsUsd !== undefined && positionB.assetsUsd > 0
                ? positionB.assetsUsd
                : 0;

            // Sort descending (highest to lowest)
            return valueB - valueA;
        });
    }, [baseVaults, isMounted, morphoHoldings.positions]);

    // Legacy support: if onVaultSelect is provided, use it
    // Otherwise, VaultListCard will handle navigation directly
    const handleVaultClick = onVaultSelect ? (vault: Vault) => {
        if (vault.address === selectedVaultAddress) {
            onVaultSelect(null);
        } else {
            onVaultSelect(vault);
        }
    } : undefined;

    return (
        <div className="flex rounded-lg w-full justify-center items-center">
            <div className="flex flex-col items-center justify-center h-full w-full">
                <div className="flex flex-col items-start justify-start w-full h-full p-2 sm:p-4">
                    {/* Header Row: Available Vaults + Column Headers - Hidden on mobile */}
                    <div className="hidden md:block w-full px-4 md:px-6 pb-2 border-b border-[var(--border)] mb-0">
                        <div className="flex items-center justify-between w-full">
                            <h1 className="text-md text-left text-[var(--foreground)]">Available Vaults</h1>
                            <div className="flex items-center gap-6 flex-1 justify-end">
                                <div className="text-sm text-[var(--foreground-secondary)] text-right min-w-[140px]">
                                    Your Position
                                </div>
                                <div className="text-sm text-[var(--foreground-secondary)] text-right min-w-[120px]">
                                    APY / TVL
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Mobile header - simpler */}
                    <div className="md:hidden w-full px-2 pb-2 border-b border-[var(--border)] mb-0">
                        <h1 className="text-md text-left text-[var(--foreground)]">Available Vaults</h1>
                    </div>
                    <div className="flex flex-col items-start justify-start w-full h-full overflow-y-auto pt-0">
                        {sortedVaults.map((vault, index) => (
                            <div key={`${vault.address}-${index}`} className="w-full">
                                <VaultListCard 
                                    vault={vault} 
                                    onClick={handleVaultClick}
                                    isSelected={selectedVaultAddress ? vault.address === selectedVaultAddress : undefined}
                                />
                                {index < sortedVaults.length - 1 && (
                                    <div className="w-full h-px bg-[var(--border)]"></div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
