import { Vault, getVaultLogo } from '../types/vault';
import Image from 'next/image';
interface VaultListCardProps {
    vault: Vault;
    onClick?: (vault: Vault) => void;
    isSelected?: boolean;
}

export default function VaultListCard({ vault, onClick, isSelected }: VaultListCardProps) {

    return (
        <div 
            className={`flex items-center justify-between w-full rounded-lg cursor-pointer transition-all p-4 ${
                isSelected 
                    ? 'bg-[var(--primary-subtle)] border-2 border-[var(--primary)] shadow-md' 
                    : 'hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)]'
            }`}
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
                        className="w-full h-full object-contain"
                    />
                </div>
                <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-foreground">{vault.name}</h3>
                    <p className="text-xs text-foreground-secondary font-mono">
                        {`${vault.address.slice(0, 6)}...${vault.address.slice(-4)}`}
                    </p>
                </div>
            </div>


            
        </div>
    )
}