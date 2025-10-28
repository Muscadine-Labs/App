import VaultList from "../features/vault/VaultList";
import { Vault } from "../../types/vault";

interface LeftDashboardSectionProps {
    onVaultSelect: (vault: Vault | null) => void;
    selectedVaultAddress?: string;
}

export default function LeftDashboardSection({ onVaultSelect, selectedVaultAddress }: LeftDashboardSectionProps) {
    return (
        <div className="flex flex-col rounded-lg bg-[var(--surface)] justify-start items-center h-full w-full p-4">
            <VaultList 
                onVaultSelect={onVaultSelect}
                selectedVaultAddress={selectedVaultAddress}
            />
        </div>
    )
}