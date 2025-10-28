import { VAULTS } from "@/lib/vaults";
import VaultListCard from "./VaultListCard";
import { Vault } from "../../../types/vault";

interface VaultListProps {
    onVaultSelect: (vault: Vault | null) => void;
    selectedVaultAddress?: string;
}

export default function VaultList({ onVaultSelect, selectedVaultAddress }: VaultListProps) {
    const vaults: Vault[] = Object.values(VAULTS).map((vault) => ({
        address: vault.address,
        name: vault.name,
        symbol: vault.symbol,
        chainId: vault.chainId,
    }));

    const handleVaultClick = (vault: Vault) => {
        // If the clicked vault is already selected, deselect it
        if (vault.address === selectedVaultAddress) {
            onVaultSelect(null);
        } else {
            onVaultSelect(vault);
        }
    };

    return (
        <div className="flex rounded-lg w-full justify-center items-center">
            <div className="flex flex-col items-center justify-center h-full w-full">
                <div className="flex flex-col items-start justify-start w-full h-full p-4 gap-4">
                    <h1 className="text-md text-left text-[var(--foreground)] ml-2">Available Vaults</h1>
                    <div className=" bg-[var(--surface-elevated)] rounded-lg flex flex-col items-start justify-start w-full h-full overflow-y-auto">
                        {vaults.map((vault, index) => (
                            <VaultListCard 
                                key={`${vault.address}-${index}`}
                                vault={vault} 
                                onClick={handleVaultClick}
                                isSelected={vault.address === selectedVaultAddress}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}