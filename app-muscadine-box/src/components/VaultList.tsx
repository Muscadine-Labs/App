import { VAULTS } from "@/lib/vaults";
import VaultListCard, { Vault } from "./VaultListCard";

export default function VaultList() {
    const vaults: Vault[] = Object.values(VAULTS).map((vault) => ({
        address: vault.address,
        name: vault.name,
        symbol: vault.symbol,
        chainId: vault.chainId,
        // Mock financial data - in real app, this would come from API
        totalValueLocked: Math.random() * 10000000 + 1000000, // $1M - $11M
        apy: Math.random() * 15 + 5, // 5% - 20%
        apyChange: (Math.random() - 0.5) * 2, // -1% to +1%
        riskLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as 'low' | 'medium' | 'high',
        status: 'active' as const,
        lastUpdated: new Date().toISOString(),
    }));

    const handleVaultClick = (vault: Vault) => {
        console.log('Selected vault:', vault);
        // Handle vault selection logic here
    };

    return (
        <div className="flex rounded-lg w-full justify-center items-center">
            <div className="flex flex-col items-center justify-center h-full w-full">
                <div className="flex flex-col items-start justify-start w-full h-full p-4 gap-4">
                    <h1 className="text-md text-left text-[var(--foreground)] ml-2">Available Vaults</h1>
                    <div className=" bg-[var(--surface-elevated)] rounded-lg flex flex-col items-center justify-start w-full h-full overflow-y-auto gap-2">
                        {vaults.map((vault, index) => (
                            <VaultListCard 
                                key={`${vault.address}-${index}`}
                                vault={vault} 
                                onClick={handleVaultClick}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}