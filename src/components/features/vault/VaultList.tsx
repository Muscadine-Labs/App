import { VAULTS } from "@/lib/vaults";
import VaultListCard from "./VaultListCard";
import { Vault } from "../../../types/vault";
import { useEffect } from "react";
import { useElementTracker } from "../../../hooks/useElementTracker";

interface VaultListProps {
    onVaultSelect?: (vault: Vault | null) => void;
    selectedVaultAddress?: string;
}

export default function VaultList({ onVaultSelect, selectedVaultAddress }: VaultListProps = {}) {
    const { registerElement, unregisterElement } = useElementTracker({ component: 'VaultList' });
    const vaults: Vault[] = Object.values(VAULTS).map((vault) => ({
        address: vault.address,
        name: vault.name,
        symbol: vault.symbol,
        chainId: vault.chainId,
    }));

    // Element tracking for learning system
    useEffect(() => {
        registerElement('vault-list', { type: 'strategy' });
        registerElement('vault-cards', { type: 'strategy' });

        return () => {
            unregisterElement('vault-list');
            unregisterElement('vault-cards');
        };
    }, [registerElement, unregisterElement]);

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
                <div className="flex flex-col items-start justify-start w-full h-full p-4 gap-4">
                    <h1 className="text-md text-left text-[var(--foreground)] ml-2">Available Vaults</h1>
                    <div className="flex flex-col items-start justify-start w-full h-full overflow-y-auto">
                        {vaults.map((vault, index) => (
                            <div key={`${vault.address}-${index}`} className="w-full">
                                <VaultListCard 
                                    vault={vault} 
                                    onClick={handleVaultClick}
                                    isSelected={selectedVaultAddress ? vault.address === selectedVaultAddress : undefined}
                                />
                                {index < vaults.length - 1 && (
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