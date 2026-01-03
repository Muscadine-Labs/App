import { VAULTS } from "@/lib/vaults";
import VaultListCard from "./VaultListCard";
import { Vault, MorphoVaultData } from "../../../types/vault";
import { useWallet } from "../../../contexts/WalletContext";
import { useVaultData } from "../../../contexts/VaultDataContext";
import { useAccount } from "wagmi";
import { useMemo, useState, useEffect } from "react";

interface VaultListProps {
    onVaultSelect?: (vault: Vault | null) => void;
    selectedVaultAddress?: string;
}

export default function VaultList({ onVaultSelect, selectedVaultAddress }: VaultListProps = {} as VaultListProps) {
    const { morphoHoldings } = useWallet();
    const { getVaultData } = useVaultData();
    const { address } = useAccount();
    
    // Store API positions for all vaults (GraphQL primary source)
    const [apiPositions, setApiPositions] = useState<Map<string, {
        assets: number;
        assetsUsd: number;
        shares: number;
    }>>(new Map());
    
    // Fetch API positions for all vaults
    useEffect(() => {
        if (!address) {
            setApiPositions(new Map());
            return;
        }
        
        const fetchAllPositions = async () => {
            const positionsMap = new Map<string, {
                assets: number;
                assetsUsd: number;
                shares: number;
            }>();
            
            const vaults = Object.values(VAULTS);
            const positionPromises = vaults.map(async (vault) => {
                try {
                    const vaultData = getVaultData(vault.address);
                    if (!vaultData) return;
                    
                    const response = await fetch(
                        `/api/vaults/${vault.address}/position-history?chainId=${vault.chainId}&userAddress=${address}&period=all`
                    );
                    
                    const data = await response.json().catch(() => ({}));
                    
                    if (data && typeof data === 'object' && data.currentPosition) {
                        const currentPos = data.currentPosition;
                        const assetDecimals = vaultData.assetDecimals || (vault.symbol === 'USDC' ? 6 : 18);
                        
                        // Convert raw values to decimal
                        const assetsRaw = typeof currentPos.assets === 'string' 
                            ? parseFloat(currentPos.assets) 
                            : (typeof currentPos.assets === 'number' ? currentPos.assets : 0);
                        const assetsDecimal = assetsRaw / Math.pow(10, assetDecimals);
                        
                        const sharesRaw = typeof currentPos.shares === 'string' 
                            ? parseFloat(currentPos.shares) 
                            : (typeof currentPos.shares === 'number' ? currentPos.shares : 0);
                        const sharesDecimal = sharesRaw / 1e18;
                        
                        const sharePriceUsd = (vaultData as MorphoVaultData).sharePriceUsd ?? 1;
                        const assetsUsd = typeof currentPos.assetsUsd === 'number' 
                            ? currentPos.assetsUsd 
                            : (assetsDecimal * sharePriceUsd);
                        
                        positionsMap.set(vault.address.toLowerCase(), {
                            assets: assetsDecimal,
                            assetsUsd,
                            shares: sharesDecimal,
                        });
                    }
                } catch {
                    // Silently fail for individual vaults
                }
            });
            
            await Promise.all(positionPromises);
            setApiPositions(positionsMap);
        };
        
        fetchAllPositions();
    }, [address, getVaultData]);
    
    // Sort vaults by user position (highest to lowest) - use GraphQL API as primary source
    const sortedVaults = useMemo(() => {
        const vaults: Vault[] = Object.values(VAULTS).map((vault) => ({
            address: vault.address,
            name: vault.name,
            symbol: vault.symbol,
            chainId: vault.chainId,
        }));

        // Calculate position value for each vault and sort
        return vaults.sort((a, b) => {
            // Primary: Use GraphQL API position value
            const apiPositionA = apiPositions.get(a.address.toLowerCase());
            const apiPositionB = apiPositions.get(b.address.toLowerCase());
            
            let valueA = 0;
            let valueB = 0;
            
            // Primary: Use API position USD value
            if (apiPositionA && apiPositionA.assetsUsd > 0) {
                valueA = apiPositionA.assetsUsd;
            } else {
                // Fallback: Use Alchemy position
                const positionA = morphoHoldings.positions.find(
                    pos => pos.vault.address.toLowerCase() === a.address.toLowerCase()
                );
                valueA = positionA 
                    ? (parseFloat(positionA.shares) / 1e18) * positionA.vault.state.sharePriceUsd 
                    : 0;
            }
            
            // Primary: Use API position USD value
            if (apiPositionB && apiPositionB.assetsUsd > 0) {
                valueB = apiPositionB.assetsUsd;
            } else {
                // Fallback: Use Alchemy position
                const positionB = morphoHoldings.positions.find(
                    pos => pos.vault.address.toLowerCase() === b.address.toLowerCase()
                );
                valueB = positionB 
                    ? (parseFloat(positionB.shares) / 1e18) * positionB.vault.state.sharePriceUsd 
                    : 0;
            }

            // Sort descending (highest to lowest)
            return valueB - valueA;
        });
    }, [morphoHoldings.positions, apiPositions]);

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