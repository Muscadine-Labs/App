import { Vault, MorphoVaultData, getVaultLogo } from '../types/vault';
import Link from "next/link";
import Image from "next/image";
import { useVaultDataFetch } from '../hooks/useVaultDataFetch';
import { formatSmartCurrency } from '../lib/formatter';
import CopiableAddress from './CopiableAddress';
import { useState, useRef } from 'react';
import { useOnClickOutside } from '../hooks/onClickOutside';

interface VaultDetailedProps {
    selectedVault: Vault | null;
}

export default function VaultDetailed({ selectedVault }: VaultDetailedProps) {
    const { vaultData, isLoading, hasError, refetch } = useVaultDataFetch(selectedVault);
    const [showApyBreakdown, setShowApyBreakdown] = useState(false);
    const apyBreakdownRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useOnClickOutside(apyBreakdownRef, () => setShowApyBreakdown(false));

    // Debug logging
    if (vaultData) {
        console.log('VaultDetailed data:', {
            rewardsApr: vaultData.rewardsApr,
            rewardSymbol: vaultData.rewardSymbol,
            netApyWithoutRewards: vaultData.netApyWithoutRewards,
            apy: vaultData.apy
        });
    }

    if (!selectedVault) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <p className="text-[var(--foreground-muted)] text-sm">
                    Select a vault to view details
                </p>
            </div>
        );
    }


    if (isLoading && !vaultData) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
                <p className="text-[var(--foreground-muted)] text-sm mt-2">
                    Loading vault data...
                </p>
            </div>
        );
    }

    if (hasError && !vaultData) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <p className="text-[var(--danger)] text-sm">
                    Failed to load vault data
                </p>
                <button 
                    onClick={refetch}
                    className="text-[var(--primary)] text-sm mt-2 hover:underline"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!vaultData) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <p className="text-[var(--foreground-muted)] text-sm">
                    No vault data available
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 h-full justify-between">
            <div className="flex flex-col gap-6">
                {/* General Information Section */}
                <div className="flex flex-col gap-4">
                    <div className="border-b border-[var(--border-subtle)] pb-2">
                        <h3 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide">
                            General Information
                        </h3>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Name</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                {vaultData.name}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Asset</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[var(--foreground)]">
                                    {vaultData.symbol}
                                </span>
                                <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center overflow-hidden">
                                    <Image 
                                        src={getVaultLogo(vaultData.symbol)} 
                                        alt={`${vaultData.symbol} logo`}
                                        width={40}
                                        height={40}
                                        className={`w-full h-full object-contain ${
                                            vaultData.symbol === 'WETH' ? 'scale-75' : ''
                                        }`}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Address</span>
                            <CopiableAddress 
                                address={vaultData.address}
                                className="text-sm text-[var(--foreground)]"
                                truncateLength={6}
                            />
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Curator</span>
                            {vaultData.curator.startsWith('0x') ? (
                                <CopiableAddress 
                                    address={vaultData.curator}
                                    className="text-sm text-[var(--foreground)]"
                                    truncateLength={6}
                                />
                            ) : (
                                <span className="text-sm font-medium text-[var(--foreground)]">
                                    {vaultData.curator}
                                </span>
                            )}
                        </div>
                        
                    </div>
                </div>

                {/* Stats Section */}
                <div className="flex flex-col gap-4">
                    <div className="border-b border-[var(--border-subtle)] pb-2">
                        <h3 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide">
                            Performance Stats
                        </h3>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">TVL</span>
                            <span className="text-sm font-semibold text-[var(--foreground)]">
                                {formatSmartCurrency(vaultData.totalValueLocked)}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1.5 relative">
                                <span className="text-sm text-[var(--foreground-secondary)]">APY</span>
                                <div ref={apyBreakdownRef}>
                                    <button
                                        onClick={() => setShowApyBreakdown(!showApyBreakdown)}
                                        className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
                                        aria-label="APY breakdown"
                                    >
                                        <span className="text-[10px] text-[var(--foreground-secondary)] font-semibold">i</span>
                                    </button>
                                    
                                    {showApyBreakdown && (
                                        <div className="absolute top-full left-0 mt-2 z-10 bg-[var(--surface-elevated)] rounded-lg p-3 text-sm space-y-1.5 shadow-lg border border-[var(--border-subtle)] min-w-[200px]">
                                            <div className="flex justify-between items-center gap-4">
                                                <span className="text-[var(--foreground)]">{vaultData.symbol}</span>
                                                <span className="text-[var(--foreground)] font-medium">
                                                    {((vaultData.netApyWithoutRewards || 0) * 100).toFixed(2)}%
                                                </span>
                                            </div>
                                            
                                            <div className="flex justify-between items-center gap-4">
                                                <span className="text-[var(--foreground)]">
                                                    {vaultData.rewardSymbol || 'REWARDS'}
                                                </span>
                                                <span className="text-[var(--foreground)] font-medium">
                                                    {((vaultData.rewardsApr || 0) * 100).toFixed(2)}%
                                                </span>
                                            </div>
                                            
                                            {vaultData.performanceFee !== undefined && vaultData.performanceFee > 0 && (
                                                <div className="flex justify-between items-center gap-4">
                                                    <span className="text-[var(--foreground)]">
                                                        Perf. Fee ({vaultData.performanceFee.toFixed(0)}%)
                                                    </span>
                                                    <span className="text-[var(--foreground)] font-medium">
                                                        -{(((vaultData.netApyWithoutRewards || 0) + (vaultData.rewardsApr || 0)) * (vaultData.performanceFee / 100) * 100).toFixed(2)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className="text-sm font-semibold text-[var(--success)]">
                                {(vaultData.apy * 100).toFixed(2)}%
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Total Deposits</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                {formatSmartCurrency(vaultData.totalDeposits)}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Current Liquidity</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                {formatSmartCurrency(vaultData.currentLiquidity)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Risk & Security Section */}
                <div className="flex flex-col gap-4">
                    <div className="border-b border-[var(--border-subtle)] pb-2">
                        <h3 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide">
                            Risk & Security
                        </h3>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        {vaultData.whitelisted !== undefined && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[var(--foreground-secondary)]">Whitelisted</span>
                                <span className={`text-sm font-medium ${
                                    vaultData.whitelisted 
                                        ? 'text-[var(--success)]' 
                                        : 'text-[var(--warning)]'
                                }`}>
                                    {vaultData.whitelisted ? 'Yes' : 'No'}
                                </span>
                            </div>
                        )}
                        
                        {vaultData.timelockDuration !== undefined && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[var(--foreground-secondary)]">Timelock Duration</span>
                                <span className="text-sm font-medium text-[var(--foreground)]">
                                    {vaultData.timelockDuration === 0 
                                        ? 'None' 
                                        : `${(vaultData.timelockDuration / 3600).toFixed(0)} hours`
                                    }
                                </span>
                            </div>
                        )}

                        
                        {vaultData.allocatedMarkets && vaultData.allocatedMarkets.length > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[var(--foreground-secondary)]">Allocated Markets</span>
                                <span className="text-sm font-medium text-[var(--foreground)]">
                                    {vaultData.allocatedMarkets.length}
                                </span>
                            </div>
                        )}
                        
                        {vaultData.guardianAddress && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[var(--foreground-secondary)]">Guardian</span>
                                <CopiableAddress 
                                    address={vaultData.guardianAddress}
                                    className="text-sm text-[var(--foreground)]"
                                    truncateLength={6}
                                />
                            </div>
                        )}
                        
                        {vaultData.oracleAddress && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[var(--foreground-secondary)]">Oracle</span>
                                <CopiableAddress 
                                    address={vaultData.oracleAddress}
                                    className="text-sm text-[var(--foreground)]"
                                    truncateLength={6}
                                />
                            </div>
                        )}
                        
                        
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-auto pt-4 flex gap-3 justify-center">
                <Link 
                    href={`/vaults?address=${selectedVault.address}`}
                    className="flex bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white justify-center items-center text-sm py-3 px-4 rounded-lg transition-colors"
                >
                    Interact with Vault
                </Link>
                <a 
                    href={`https://basescan.org/address/${vaultData.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--foreground)] justify-center items-center text-sm py-3 px-4 rounded-lg transition-colors text-center border border-[var(--border-subtle)] gap-2"
                >
                    View on BaseScan
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 13V19C18 20.1046 17.1046 21 16 21H5C3.89543 21 3 20.1046 3 19V8C3 6.89543 3.89543 6 5 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                   
                </a>
            </div>
        </div>
    );
}