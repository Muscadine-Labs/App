import { Vault, getVaultLogo } from '../../../types/vault';
import Image from 'next/image';
import { useVaultData } from '../../../contexts/VaultDataContext';
import { useWallet } from '../../../contexts/WalletContext';
import { formatSmartCurrency } from '../../../lib/formatter';
import { useRouter, usePathname } from 'next/navigation';
import { getVaultRoute } from '../../../lib/vault-utils';

interface VaultListCardProps {
    vault: Vault;
    onClick?: (vault: Vault) => void;
    isSelected?: boolean;
}

export default function VaultListCard({ vault, onClick, isSelected }: VaultListCardProps) {
    const { getVaultData, isLoading } = useVaultData();
    const { morphoHoldings } = useWallet();
    const router = useRouter();
    const pathname = usePathname();
    const vaultData = getVaultData(vault.address);
    const loading = isLoading(vault.address);
    
    // Check if this vault is active based on the current route
    const vaultRoute = getVaultRoute(vault.address);
    const isActive = pathname === vaultRoute || isSelected;

    // Find user's position in this vault
    const userPosition = morphoHoldings.positions.find(
        pos => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
    );

    // Calculate user's position value (convert shares from raw units to human-readable)
    const userPositionValue = userPosition ? 
        (parseFloat(userPosition.shares) / 1e18) * userPosition.vault.state.sharePriceUsd : 0;

    const handleClick = () => {
        // If onClick prop is provided (legacy behavior), use it
        if (onClick) {
            onClick(vault);
        } else {
            // Otherwise, navigate to the vault route
            router.push(vaultRoute);
        }
    };

    return (
        <div 
            className={`flex items-center justify-between w-full cursor-pointer transition-all p-6 min-w-[320px] ${
                isActive 
                    ? 'bg-[var(--primary-subtle)] border-2 border-[var(--primary)] shadow-md rounded-lg' 
                    : 'hover:bg-[var(--surface-hover)] rounded-lg'
            }`}
            onClick={handleClick}
        >
            {/* Left side - Vault info */}
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-white">
                    <Image
                        src={getVaultLogo(vault.symbol)} 
                        alt={`${vault.symbol} logo`}
                        width={40}
                        height={40}
                        className={`w-full h-full object-contain ${
                            vault.symbol === 'WETH' ? 'scale-75' : ''
                        }`}
                    />
                </div>
                <div className="flex flex-col">
                    <h3 className="text-xl text-foreground font-funnel">{vault.name}</h3>
                </div>
            </div>

            {/* Right side - User holdings, APY, and TVL */}
            <div className="flex items-center gap-6">
                {/* User Position Holdings */}
                {userPosition && userPositionValue > 0 && (
                    <div className="flex flex-col items-end">
                        <span className="text-base font-semibold text-[var(--foreground)]">
                            {formatSmartCurrency(userPositionValue)}
                        </span>
                        <span className="text-sm text-[var(--foreground-secondary)]">
                            Your Position
                        </span>
                    </div>
                )}
                
                {/* APY and TVL */}
                {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--primary)]"></div>
                ) : vaultData ? (
                    <div className="flex flex-col items-end">
                        <span className="text-base font-semibold text-[var(--primary)]">
                            {(vaultData.apy * 100).toFixed(2)}% APY
                        </span>
                        <span className="text-sm text-foreground-secondary">
                            {formatSmartCurrency(vaultData.totalValueLocked)} TVL
                        </span>
                    </div>
                ) : (
                    <span className="text-sm text-foreground-muted">No data</span>
                )}
            </div>
        </div>
    )
}