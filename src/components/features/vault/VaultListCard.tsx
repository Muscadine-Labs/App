import { Vault, getVaultLogo } from '../../../types/vault';
import Image from 'next/image';
import { useVaultData } from '../../../contexts/VaultDataContext';
import { useWallet } from '../../../contexts/WalletContext';
import { formatSmartCurrency, formatCurrency, formatNumber } from '../../../lib/formatter';
import { useRouter, usePathname } from 'next/navigation';
import { getVaultRoute } from '../../../lib/vault-utils';
import { useAccount } from 'wagmi';
import { useState, useEffect, useMemo, useRef } from 'react';

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
    const [userTransactions, setUserTransactions] = useState<Array<{ type: 'deposit' | 'withdraw'; assets: string }>>([]);
    const [assetPriceUsd, setAssetPriceUsd] = useState<number>(0);
    const [isLoadingInterest, setIsLoadingInterest] = useState(false);
    const hasFetchedRef = useRef<string>('');
    
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

    // Fetch user transactions and asset price from GraphQL to calculate interest earned
    useEffect(() => {
        // Only fetch if user has a position and is connected
        if (!address || !userPosition || !vaultData) {
            return;
        }

        // Create a unique key for this fetch to prevent duplicate fetches
        const fetchKey = `${address}-${vault.address}-${userPosition.shares}`;
        if (hasFetchedRef.current === fetchKey) {
            return; // Already fetched for this combination
        }

        let cancelled = false;

        const fetchData = async () => {
            setIsLoadingInterest(true);
            try {
                // Fetch both in parallel
                const [transactionsResponse, graphqlResponse] = await Promise.all([
                    fetch(`/api/vaults/${vault.address}/activity?chainId=${vault.chainId}&userAddress=${address}`),
                    fetch('https://api.morpho.org/graphql', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            query: `
                                query VaultAssetPrice($address: String!, $chainId: Int!) {
                                    vaultByAddress(address: $address, chainId: $chainId) {
                                        asset {
                                            priceUsd
                                        }
                                    }
                                }
                            `,
                            variables: {
                                address: vault.address,
                                chainId: vault.chainId,
                            },
                        }),
                    })
                ]);

                if (cancelled) return;

                // Process transactions - fetch ALL transactions, not just first 100
                const transactionsData = await transactionsResponse.json();
                if (transactionsData.transactions && Array.isArray(transactionsData.transactions)) {
                    // Filter and map all transactions (deposits and withdrawals)
                    const relevantTxs = transactionsData.transactions
                        .filter((tx: { type: string; assets?: string }) => 
                            (tx.type === 'deposit' || tx.type === 'withdraw') && tx.assets
                        )
                        .map((tx: { type: string; assets: string }) => ({
                            type: tx.type as 'deposit' | 'withdraw',
                            assets: tx.assets
                        }));
                    if (!cancelled) {
                        setUserTransactions(relevantTxs);
                        hasFetchedRef.current = fetchKey;
                    }
                } else {
                    if (!cancelled) {
                        setUserTransactions([]);
                        hasFetchedRef.current = fetchKey;
                    }
                }

                // Process asset price
                const graphqlData = await graphqlResponse.json().catch(() => ({}));
                const priceUsd = graphqlData.data?.vaultByAddress?.asset?.priceUsd || 0;
                if (!cancelled) {
                    setAssetPriceUsd(priceUsd);
                }
            } catch (error) {
                // Log error but continue - we'll use fallback price
                console.warn('Failed to fetch asset price for interest calculation:', error);
                if (!cancelled) {
                    // Try to get price from vaultData or use default
                    const fallbackPrice = vaultData?.sharePrice ? 
                        (vaultData.totalValueLocked && vaultData.totalAssets ? 
                            vaultData.totalValueLocked / (parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18)) : 
                            1) : 
                        1;
                    setAssetPriceUsd(fallbackPrice);
                    hasFetchedRef.current = fetchKey;
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingInterest(false);
                }
            }
        };

        fetchData();

        return () => {
            cancelled = true;
        };
    }, [address, vault.address, vault.chainId, userPosition?.shares, vaultData]);

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

    // Calculate interest earned: Current Assets - (Total Deposits - Total Withdrawals)
    const interestEarned = useMemo(() => {
        // Don't calculate if still loading or missing required data
        if (isLoadingInterest || !userPosition || !vaultData) {
            return { tokens: 0, usd: 0 };
        }

        // Use fallback price if assetPriceUsd is 0
        const effectivePriceUsd = assetPriceUsd > 0 ? assetPriceUsd : 
            (vaultData.sharePrice ? 
                (vaultData.totalValueLocked && vaultData.totalAssets ? 
                    vaultData.totalValueLocked / (parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals || 18)) : 
                    1) : 
                1);

        // Get current assets in raw units - use same logic as getUserVaultBalance for consistency
        let currentAssetsRaw = BigInt(0);
        let rawValue: number | null = null;
        
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
                }
            }
        }

        // Convert to raw units
        if (rawValue !== null && !isNaN(rawValue) && rawValue > 0) {
            const assetDecimals = vaultData.assetDecimals || 18;
            currentAssetsRaw = BigInt(Math.floor(rawValue * Math.pow(10, assetDecimals)));
        }

        // If we can't determine current assets, return 0
        if (currentAssetsRaw === BigInt(0)) {
            return { tokens: 0, usd: 0 };
        }

        // Sum deposits and withdrawals
        let totalDepositsRaw = BigInt(0);
        let totalWithdrawalsRaw = BigInt(0);

        userTransactions.forEach(tx => {
            if (!tx.assets) return; // Skip transactions without assets data
            
            try {
                const assetsRaw = BigInt(tx.assets);
                if (tx.type === 'deposit') {
                    totalDepositsRaw += assetsRaw;
                } else if (tx.type === 'withdraw') {
                    totalWithdrawalsRaw += assetsRaw;
                }
            } catch {
                // Skip invalid asset values
                console.warn('Invalid asset value in transaction:', tx);
            }
        });

        // Calculate interest earned in raw units
        // Interest = Current Assets - (Total Deposits - Total Withdrawals)
        const netDeposits = totalDepositsRaw - totalWithdrawalsRaw;
        
        // Calculate interest - if no transactions, assume all current assets are from deposits
        // (this handles the case where transaction history might be incomplete)
        const interestRaw = currentAssetsRaw > netDeposits 
            ? currentAssetsRaw - netDeposits 
            : BigInt(0);

        // Convert to decimal
        const assetDecimals = vaultData.assetDecimals || 18;
        const interestTokens = Number(interestRaw) / Math.pow(10, assetDecimals);

        // Calculate USD value using asset price (with fallback)
        const interestUsd = interestTokens * effectivePriceUsd;

        return {
            tokens: Math.max(0, interestTokens), // Ensure non-negative
            usd: Math.max(0, interestUsd) // Ensure non-negative
        };
    }, [userPosition, vaultData, userTransactions, assetPriceUsd, isLoadingInterest]);

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

            {/* Right side - Your Position, Interest Earned, APY, and TVL */}
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

                {/* Interest Earned Column */}
                <div className="text-right min-w-[140px]">
                    {userPosition && userPositionValue > 0 ? (
                        isLoadingInterest ? (
                            <div className="flex flex-col">
                                <span className="text-base font-semibold text-[var(--foreground)]">—</span>
                                <span className="text-sm text-[var(--foreground-secondary)] mt-1">—</span>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                <span className="text-base font-semibold text-[var(--foreground)]">
                                    {interestEarned.tokens > 0 
                                        ? formatNumber(interestEarned.tokens, { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 6 
                                          })
                                        : '0.00'}
                                </span>
                                <span className="text-sm text-[var(--foreground-secondary)] mt-1">
                                    {formatSmartCurrency(interestEarned.usd)}
                                </span>
                            </div>
                        )
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