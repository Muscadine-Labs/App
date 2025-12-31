import { Vault, getVaultLogo } from '../../../types/vault';
import Image from 'next/image';
import { useVaultData } from '../../../contexts/VaultDataContext';
import { useWallet } from '../../../contexts/WalletContext';
import { formatSmartCurrency, formatCurrency, formatNumber } from '../../../lib/formatter';
import { useRouter, usePathname } from 'next/navigation';
import { getVaultRoute } from '../../../lib/vault-utils';
import { useAccount } from 'wagmi';
import { useState } from 'react';

interface VaultListCardProps {
    vault: Vault;
    onClick?: (vault: Vault) => void;
    isSelected?: boolean;
}

export default function VaultListCard({ vault, onClick, isSelected }: VaultListCardProps) {
    const { getVaultData, isLoading } = useVaultData();
    const { morphoHoldings } = useWallet();
    const { address } = useAccount();
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

    // Get user's vault balance from GraphQL (user's asset balance in this vault)
    const getUserVaultBalance = () => {
        if (!userPosition || !vaultData) return null;
        
        let rawValue: number;
        
        // First priority: Use position.assets if available (from GraphQL)
        if (userPosition.assets) {
            rawValue = parseFloat(userPosition.assets) / Math.pow(10, vaultData.assetDecimals || 18);
        } else {
            // Second priority: Calculate from shares using share price
            const sharesDecimal = parseFloat(userPosition.shares) / 1e18;
            
            if (vaultData.sharePrice && sharesDecimal > 0) {
                rawValue = sharesDecimal * vaultData.sharePrice;
            } else if (userPosition.vault?.state?.totalSupply && vaultData.totalAssets) {
                // Third priority: Calculate share price from totalAssets / totalSupply
                const totalSupplyDecimal = parseFloat(userPosition.vault.state.totalSupply) / 1e18;
                const totalAssetsDecimal = parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18);
                
                if (totalSupplyDecimal > 0) {
                    const sharePriceInAsset = totalAssetsDecimal / totalSupplyDecimal;
                    rawValue = sharesDecimal * sharePriceInAsset;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }
        
        if (isNaN(rawValue) || rawValue === 0) return null;
        
        // Count digits before decimal point
        const integerPart = Math.floor(Math.abs(rawValue));
        const digitCount = integerPart === 0 ? 0 : integerPart.toString().length;
        
        let decimalPlaces: number;
        if (digitCount >= 3) {
            decimalPlaces = 2; // 3+ digits: 2 decimals
        } else if (digitCount === 2) {
            decimalPlaces = 3; // 2 digits: 3 decimals
        } else if (digitCount === 1) {
            decimalPlaces = 4; // 1 digit: 4 decimals
        } else {
            decimalPlaces = 5; // Less than 1 (0.something): 5 decimals
        }
        
        return formatNumber(rawValue, {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces
        });
    };
    
    const userVaultBalance = getUserVaultBalance();

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
            <div className="flex items-center gap-4 flex-1">
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

            {/* Right side - Your Position, APY, and TVL */}
            <div className="flex items-center gap-6 flex-1 justify-end">
                {/* Your Position Column - Token balance on top, USD below */}
                <div className="text-right min-w-[140px]">
                    {userPosition && userPositionValue > 0 && userVaultBalance ? (
                        <div className="flex flex-col">
                            <span className="text-base font-semibold text-[var(--foreground)]">
                                {userVaultBalance} {vault.symbol}
                            </span>
                            <span className="text-sm text-[var(--foreground-secondary)] mt-1">
                                {formatCurrency(userPositionValue)}
                            </span>
                        </div>
                    ) : (
                        <span className="text-sm text-[var(--foreground-muted)]">-</span>
                    )}
                </div>
                
                {/* APY and TVL */}
                <div className="text-right min-w-[120px]">
                    {loading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--primary)] mx-auto"></div>
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
        </div>
    )
}