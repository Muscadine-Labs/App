import { Vault, getVaultLogo } from '../../../types/vault';
import Image from 'next/image';
import { useVaultData } from '../../../contexts/VaultDataContext';
import { useWallet } from '../../../contexts/WalletContext';
import { formatSmartCurrency, formatCurrency, formatNumber, formatPercentage } from '../../../lib/formatter';
import { useRouter, usePathname } from 'next/navigation';
import { getVaultRoute } from '../../../lib/vault-utils';
import { useAccount, useReadContract } from 'wagmi';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useMemo } from 'react';
import { usePrices } from '../../../contexts/PriceContext';

interface VaultListCardProps {
    vault: Vault;
    onClick?: (vault: Vault) => void;
    isSelected?: boolean;
}

// ERC20 ABI for balanceOf
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ERC4626 ABI for convertToAssets
const ERC4626_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function VaultListCard({ vault, onClick, isSelected }: VaultListCardProps) {
    const { getVaultData, isLoading } = useVaultData();
    const { morphoHoldings } = useWallet();
    const { address } = useAccount();
    const { btc: btcPrice, eth: ethPrice } = usePrices();
    const router = useRouter();
    const pathname = usePathname();
    const vaultData = getVaultData(vault.address);
    const loading = isLoading(vault.address);
    
    // Check if this vault is active based on the current route
    const vaultRoute = getVaultRoute(vault.address);
    const isActive = pathname === vaultRoute || isSelected;

    // Get shares using balanceOf
    const { data: sharesRaw } = useReadContract({
      address: address ? vault.address as `0x${string}` : undefined,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: address ? [address as `0x${string}`] : undefined,
      query: { enabled: !!address },
    });

    // Convert shares to assets using convertToAssets
    const { data: assetsRaw } = useReadContract({
      address: sharesRaw && sharesRaw > BigInt(0) ? vault.address as `0x${string}` : undefined,
      abi: ERC4626_ABI,
      functionName: 'convertToAssets',
      args: sharesRaw && sharesRaw > BigInt(0) ? [sharesRaw] : undefined,
      query: { enabled: !!sharesRaw && sharesRaw > BigInt(0) },
    });

    // Find user's position in this vault (from WalletContext - already uses RPC)
    const userPosition = morphoHoldings.positions.find(
        pos => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
    );

    // Calculate user's position value using RPC data
    const userPositionValue = useMemo(() => {
        // Use position from WalletContext (already calculated with RPC + price)
        if (userPosition && userPosition.assetsUsd !== undefined && userPosition.assetsUsd > 0) {
            return userPosition.assetsUsd;
        }
        
        // Fallback: Calculate from RPC data if available
        if (assetsRaw && vaultData) {
            const assetDecimals = vaultData.assetDecimals || (vault.symbol === 'USDC' ? 6 : 18);
            const assetsDecimal = Number(assetsRaw) / Math.pow(10, assetDecimals);
            
            // Get asset price (same as liquid assets)
            let assetPrice = 0;
            const symbolUpper = vault.symbol.toUpperCase();
            if (symbolUpper === 'USDC' || symbolUpper === 'USDT' || symbolUpper === 'DAI') {
                assetPrice = 1;
            } else if (symbolUpper === 'WETH') {
                assetPrice = ethPrice || 0;
            } else if (symbolUpper === 'CBBTC' || symbolUpper === 'CBTC') {
                assetPrice = btcPrice || 0;
            }
            
            return assetsDecimal * assetPrice;
        }
        
        return 0;
    }, [userPosition, assetsRaw, vaultData, vault.symbol, ethPrice, btcPrice]);


    const handleClick = () => {
        // If onClick prop is provided (legacy behavior), use it
        if (onClick) {
            onClick(vault);
        } else {
            // Otherwise, navigate to the vault route
            router.push(vaultRoute);
        }
    };

    // Get user's vault balance from RPC data
    const userVaultBalance = useMemo(() => {
        if (!assetsRaw || !vaultData) {
            // Fallback: Use position from WalletContext if available
            if (userPosition && userPosition.assets && vaultData) {
                const rawValue = parseFloat(userPosition.assets) / Math.pow(10, vaultData.assetDecimals || 18);
                if (isNaN(rawValue) || rawValue === 0) return null;
                
                const integerPart = Math.floor(Math.abs(rawValue));
                const digitCount = integerPart === 0 ? 0 : integerPart.toString().length;
                
                let decimalPlaces: number;
                if (digitCount >= 3) {
                    decimalPlaces = 2;
                } else if (digitCount === 2) {
                    decimalPlaces = 3;
                } else if (digitCount === 1) {
                    decimalPlaces = 4;
                } else {
                    decimalPlaces = 5;
                }
                
                return formatNumber(rawValue, {
                    minimumFractionDigits: decimalPlaces,
                    maximumFractionDigits: decimalPlaces
                });
            }
            return null;
        }
        
        const assetDecimals = vaultData.assetDecimals || (vault.symbol === 'USDC' ? 6 : 18);
        const rawValue = Number(assetsRaw) / Math.pow(10, assetDecimals);
        
        if (isNaN(rawValue) || rawValue === 0) return null;
        
        // Count digits before decimal point
        const integerPart = Math.floor(Math.abs(rawValue));
        const digitCount = integerPart === 0 ? 0 : integerPart.toString().length;
        
        let decimalPlaces: number;
        if (digitCount >= 3) {
            decimalPlaces = 2;
        } else if (digitCount === 2) {
            decimalPlaces = 3;
        } else if (digitCount === 1) {
            decimalPlaces = 4;
        } else {
            decimalPlaces = 5;
        }
        
        return formatNumber(rawValue, {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces
        });
    }, [assetsRaw, vaultData, userPosition, vault.symbol]);

    return (
        <div 
            className={`flex flex-col md:flex-row items-start md:items-center justify-between w-full cursor-pointer transition-all p-4 md:p-6 gap-4 md:gap-0 ${
                isActive 
                    ? 'bg-[var(--primary-subtle)] border-2 border-[var(--primary)] shadow-md rounded-lg' 
                    : 'hover:bg-[var(--surface-hover)] rounded-lg'
            }`}
            onClick={handleClick}
        >
            {/* Left side - Vault info */}
            <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                <div className="w-6 h-6 md:w-8 md:h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden bg-white">
                    <Image
                        src={getVaultLogo(vault.symbol)} 
                        alt={`${vault.symbol} logo`}
                        width={32}
                        height={32}
                        className={`object-contain ${
                            vault.symbol === 'WETH' ? 'scale-75' : ''
                        }`}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                    <h3 className="text-base md:text-xl text-foreground font-funnel truncate">{vault.name}</h3>
                </div>
            </div>

            {/* Right side - Your Position, APY, and TVL */}
            <div className="flex flex-row md:flex-row items-start md:items-center justify-between md:justify-end gap-4 md:gap-6 w-full md:w-auto md:flex-1">
                {/* Your Position Column - Token balance on top, USD below */}
                <div className="text-left md:text-right w-auto md:min-w-[140px]">
                    {loading || morphoHoldings.isLoading || (address && !vaultData) ? (
                        <div className="flex flex-col md:items-end gap-1.5">
                            <Skeleton width="5rem" height="1rem" />
                            <Skeleton width="4rem" height="0.875rem" />
                        </div>
                    ) : (userPosition || assetsRaw) && userPositionValue > 0 && userVaultBalance ? (
                        <div className="flex flex-col md:items-end">
                            <span className="text-sm md:text-base font-semibold text-[var(--foreground)]">
                                {userVaultBalance} {vault.symbol}
                            </span>
                            <span className="text-xs md:text-sm text-[var(--foreground-secondary)] mt-1">
                                {formatCurrency(userPositionValue)}
                            </span>
                        </div>
                    ) : (
                        <span className="text-xs md:text-sm text-[var(--foreground-muted)]">-</span>
                    )}
                </div>
                
                {/* APY and TVL - Stacked on mobile, side by side with Position */}
                <div className="text-right md:text-right w-auto md:min-w-[120px] flex-shrink-0">
                    {loading || !vaultData ? (
                        <div className="flex flex-col items-end md:items-end gap-1.5">
                            <Skeleton width="4rem" height="1rem" />
                            <Skeleton width="3rem" height="0.875rem" />
                        </div>
                    ) : (
                        <div className="flex flex-col items-end md:items-end">
                            <span className="text-sm md:text-base font-semibold text-[var(--primary)]">
                                {formatPercentage(vaultData.apy)} APY
                            </span>
                            <span className="text-xs md:text-sm text-foreground-secondary">
                                {formatSmartCurrency(vaultData.totalValueLocked || 0, { alwaysTwoDecimals: true })} TVL
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}