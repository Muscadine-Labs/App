import { Vault, getVaultLogo } from '../../../types/vault';
import Image from "next/image";
import { useVaultDataFetch } from '../../../hooks/useVaultDataFetch';
import { formatSmartCurrency } from '../../../lib/formatter';
import CopiableAddress from '../../common/CopiableAddress';
import { Button, ExternalLinkIcon } from '../../ui';
import { useState, useRef, useEffect } from 'react';
import { useOnClickOutside } from '../../../hooks/onClickOutside';
import { useElementTracker } from '../../../hooks/useElementTracker';
import { useLearning } from '../../../contexts/LearningContext';

interface VaultDetailedProps {
    selectedVault: Vault | null;
    onInteractVault: (vault: Vault) => void;
}

export default function VaultDetailed({ selectedVault, onInteractVault }: VaultDetailedProps) {
    const { vaultData, isLoading, hasError, refetch } = useVaultDataFetch(selectedVault);
    const { registerElement, unregisterElement, onHoverStart, onHoverEnd } = useElementTracker({ component: 'VaultDetailed' });
    const { setSelectedElement } = useLearning();
    const [showApyBreakdown, setShowApyBreakdown] = useState(false);
    const apyBreakdownRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useOnClickOutside(apyBreakdownRef, () => setShowApyBreakdown(false));

    // Element tracking for learning system (diff-based to avoid loops)
    const registeredIdsRef = useRef<Set<string>>(new Set());
    const addr = selectedVault?.address || null;
    const hasWhitelisted = vaultData?.whitelisted !== undefined;
    const hasTimelock = vaultData?.timelockDuration !== undefined;
    const hasGuardian = Boolean(vaultData?.guardianAddress);
    const hasOracle = Boolean(vaultData?.oracleAddress);
    const hasMarkets = (vaultData?.allocatedMarkets?.length ?? 0) > 0;
    const hasCurator = Boolean(vaultData?.curator);
    const hasPerfFee = (vaultData?.performanceFee ?? 0) > 0;

    useEffect(() => {
        const next = new Set<string>();
        if (addr) {
            next.add('vault-apy');
            next.add('vault-tvl');
            if (hasWhitelisted) next.add('vault-security');
            if (hasTimelock) next.add('vault-timelock');
            if (hasGuardian) next.add('vault-guardian');
            if (hasOracle) next.add('vault-oracle');
            if (hasMarkets) next.add('vault-markets');
            if (hasCurator) next.add('vault-curator');
            if (hasPerfFee) next.add('vault-performance-fee');
        }

        const prev = registeredIdsRef.current;
        // Register new
        next.forEach(id => {
            if (!prev.has(id)) registerElement(id as any, {});
        });
        // Unregister removed
        prev.forEach(id => {
            if (!next.has(id)) unregisterElement(id);
        });
        registeredIdsRef.current = next;
    }, [addr, hasWhitelisted, hasTimelock, hasGuardian, hasOracle, hasMarkets, hasCurator, hasPerfFee, registerElement, unregisterElement]);

    useEffect(() => {
        return () => {
            registeredIdsRef.current.forEach(id => unregisterElement(id));
            registeredIdsRef.current.clear();
        };
    }, [unregisterElement]);

    // Track APY breakdown state
    useEffect(() => {
        if (showApyBreakdown) {
            registerElement('vault-apy-breakdown', { 
                type: 'financial',
                isDetailed: true,
                priority: 100
            });
        } else {
            unregisterElement('vault-apy-breakdown');
        }
    }, [showApyBreakdown, registerElement, unregisterElement]);

    const handleInteractVault = () => {
        if (selectedVault) {
            onInteractVault(selectedVault);
        }
    };


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
                <Button 
                    onClick={refetch}
                    variant="ghost"
                    size="sm"
                >
                    Retry
                </Button>
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
                        
                        <div className="flex justify-between items-center" onMouseEnter={() => onHoverStart('vault-apy')} onMouseLeave={() => onHoverEnd('vault-apy')}>
                            <div className="flex items-center gap-1.5 relative">
                                <span className="text-sm text-[var(--foreground-secondary)]">APY</span>
                                <div ref={apyBreakdownRef}>
                                    <button
                                        onClick={() => {
                                            const next = !showApyBreakdown;
                                            setShowApyBreakdown(next);
                                            if (next) {
                                                setSelectedElement('vault-apy-breakdown');
                                            } else {
                                                setSelectedElement(null);
                                            }
                                        }}
                                        className="w-4 h-4 rounded-full border border-[var(--foreground-secondary)] flex items-center justify-center hover:bg-[var(--background-elevated)] transition-colors"
                                        aria-label="APY breakdown"
                                        onMouseEnter={() => onHoverStart('vault-apy-breakdown')}
                                        onMouseLeave={() => onHoverEnd('vault-apy-breakdown')}
                                        onFocus={() => setSelectedElement('vault-apy-breakdown')}
                                        onBlur={() => setSelectedElement(null)}
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
                <div className="flex flex-col gap-4" onMouseEnter={() => onHoverStart('vault-security-section')} onMouseLeave={() => onHoverEnd('vault-security-section')} onClick={() => setSelectedElement('vault-security-section')}>
                    <div className="border-b border-[var(--border-subtle)] pb-2">
                        <h3 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide">
                            Risk & Security
                        </h3>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        {vaultData.whitelisted !== undefined && (
                            <div className="flex justify-between items-center" onMouseEnter={() => onHoverStart('vault-security')} onMouseLeave={() => onHoverEnd('vault-security')}>
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
                            <div className="flex justify-between items-center" onMouseEnter={() => onHoverStart('vault-markets')} onMouseLeave={() => onHoverEnd('vault-markets')}>
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
                <Button 
                    onClick={handleInteractVault}
                    variant="primary"
                    size="md"
                >
                    Interact with Vault
                </Button>
                <Button
                    variant="secondary"
                    size="md"
                    icon={<ExternalLinkIcon size="sm" />}
                    iconPosition="right"
                    onClick={() => window.open(`https://basescan.org/address/${vaultData.address}`, '_blank', 'noopener,noreferrer')}
                >
                    View on BaseScan
                </Button>
            </div>
        </div>
    );
}