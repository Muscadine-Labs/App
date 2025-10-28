import { Vault, getVaultLogo } from '../../../types/vault';
import Image from 'next/image';
import { useVaultData } from '../../../contexts/VaultDataContext';
import { formatSmartCurrency } from '../../../lib/formatter';
import CopiableAddress from '../../common/CopiableAddress';
import { useElementTracker } from '../../../hooks/useElementTracker';
interface VaultListCardProps {
    vault: Vault;
    onClick?: (vault: Vault) => void;
    isSelected?: boolean;
}

export default function VaultListCard({ vault, onClick, isSelected }: VaultListCardProps) {
    const { getVaultData, isLoading } = useVaultData();
    const vaultData = getVaultData(vault.address);
    const loading = isLoading(vault.address);
    const { onHoverStart, onHoverEnd } = useElementTracker({ component: 'VaultListCard' });

    return (
        <div 
            className={`flex items-center justify-between w-full rounded-lg cursor-pointer transition-all p-3 min-w-[280px] ${
                isSelected 
                    ? 'bg-[var(--primary-subtle)] border-2 border-[var(--primary)] shadow-md' 
                    : 'hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)]'
            }`}
            onMouseEnter={() => onHoverStart('vault-cards')}
            onMouseLeave={() => onHoverEnd('vault-cards')}
            onClick={() => onClick?.(vault)}
        >
            {/* Left side - Vault info */}
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-white">
                    <Image
                        src={getVaultLogo(vault.symbol)} 
                        alt={`${vault.symbol} logo`}
                        width={32}
                        height={32}
                        className={`w-full h-full object-contain ${
                            vault.symbol === 'WETH' ? 'scale-75' : ''
                        }`}
                    />
                </div>
                <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-foreground">{vault.name}</h3>
                    <div onClick={(e) => e.stopPropagation()}>
                        <CopiableAddress 
                            address={vault.address}
                            className="text-xs text-foreground-secondary"
                            truncateLength={6}
                        />
                    </div>
                </div>
            </div>

            {/* Right side - Vault stats or loading indicator */}
            <div className="flex items-center gap-2">
                {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--primary)]"></div>
                ) : vaultData ? (
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-semibold text-[var(--success)]">
                            {(vaultData.apy * 100).toFixed(2)}% APY
                        </span>
                        <span className="text-xs text-foreground-secondary">
                            {formatSmartCurrency(vaultData.totalValueLocked)} TVL
                        </span>
                    </div>
                ) : (
                    <span className="text-xs text-foreground-muted">No data</span>
                )}
            </div>
        </div>
    )
}