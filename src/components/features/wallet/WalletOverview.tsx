'use client';

import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { formatNumber, formatCurrency } from '@/lib/formatter';
import { Skeleton } from '@/components/ui/Skeleton';
import {
    useFloating,
    autoUpdate,
    offset,
    flip,
    shift,
    useClick,
    useDismiss,
    useRole,
    useInteractions,
    FloatingPortal,
} from '@floating-ui/react';

export default function WalletOverview() {
    const { address, isConnected } = useAccount();
    const { totalUsdValue, liquidUsdValue, morphoUsdValue, tokenBalances, morphoHoldings, loading: walletLoading } = useWallet();
    const [isMounted, setIsMounted] = useState(false);
    const [totalAssetsOpen, setTotalAssetsOpen] = useState(false);
    const [liquidAssetsOpen, setLiquidAssetsOpen] = useState(false);
    const [morphoVaultsOpen, setMorphoVaultsOpen] = useState(false);

    // Floating UI setup for Total Assets dropdown
    const totalAssets = useFloating({
        open: totalAssetsOpen,
        onOpenChange: setTotalAssetsOpen,
        middleware: [offset(8), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
    });
    const totalAssetsInteractions = useInteractions([
        useClick(totalAssets.context),
        useDismiss(totalAssets.context),
        useRole(totalAssets.context),
    ]);

    // Floating UI setup for Liquid Assets dropdown
    const liquidAssets = useFloating({
        open: liquidAssetsOpen,
        onOpenChange: setLiquidAssetsOpen,
        middleware: [offset(8), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
    });
    const liquidAssetsInteractions = useInteractions([
        useClick(liquidAssets.context),
        useDismiss(liquidAssets.context),
        useRole(liquidAssets.context),
    ]);

    // Floating UI setup for Morpho Vaults dropdown
    const morphoVaults = useFloating({
        open: morphoVaultsOpen,
        onOpenChange: setMorphoVaultsOpen,
        middleware: [offset(8), flip(), shift({ padding: 8 })],
        whileElementsMounted: autoUpdate,
    });
    const morphoVaultsInteractions = useInteractions([
        useClick(morphoVaults.context),
        useDismiss(morphoVaults.context),
        useRole(morphoVaults.context),
    ]);



    // Prevent hydration mismatch by only rendering client-side content after mount
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        // Return a simple loading state during SSR
        return (
            <div className="flex flex-col items-start justify-start w-full h-full bg-[var(--surface)] rounded-lg px-4 sm:px-6 md:px-8 py-4 gap-4 md:gap-6">
                <Skeleton width="8rem" height="1.5rem" />
                <div className="flex flex-col md:flex-row items-start md:justify-between w-full gap-4 md:gap-6">
                    <div className="flex flex-col items-start w-full md:w-auto gap-2">
                        <Skeleton width="5rem" height="1rem" />
                        <Skeleton width="8rem" height="2rem" />
                    </div>
                    <div className="flex flex-col items-start w-full md:w-auto gap-2">
                        <Skeleton width="6rem" height="1rem" />
                        <Skeleton width="8rem" height="2rem" />
                    </div>
                    <div className="flex flex-col items-start w-full md:w-auto gap-2">
                        <Skeleton width="6rem" height="1rem" />
                        <Skeleton width="8rem" height="2rem" />
                    </div>
                </div>
            </div>
        );
    }

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center w-full h-full bg-[var(--surface)] rounded-lg px-4 sm:px-6 md:px-8 py-4 gap-6">
                <div className="flex flex-col items-center gap-4">
                    
                    <p className="text-[var(--foreground-secondary)] text-center max-w-md">
                        Connect your wallet to view your balance, track your investments in Morpho vaults, and manage your portfolio.
                    </p>
                </div>
            </div>
        );
    }

    // Connected state - show wallet stats
    const truncatedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
    
    // Filter and sort liquid assets - only show assets with more than $0.02, limit to 10
    const sortedLiquidAssets = [...tokenBalances]
        .filter((asset) => asset.usdValue > 0.02)
        .sort((a, b) => b.usdValue - a.usdValue)
        .slice(0, 10);
    
    // Calculate and sort Morpho vault positions by USD value, limit to 10
    const sortedVaultPositions = morphoHoldings.positions
        .map((position) => {
            const shares = parseFloat(position.shares) / 1e18;
            const sharePriceUsd = position.vault.state?.sharePriceUsd || 0;
            const usdValue = shares * sharePriceUsd;
            return {
                address: position.vault.address,
                name: position.vault.name,
                symbol: position.vault.symbol,
                usdValue,
            };
        })
        .filter((pos) => pos.usdValue > 0.02) // Only show positions with more than $0.02
        .sort((a, b) => b.usdValue - a.usdValue)
        .slice(0, 10);
    

    return (
        <div className="flex flex-col items-start justify-start w-full h-full bg-[var(--surface)] rounded-lg px-4 sm:px-6 md:px-8 py-4 gap-4 md:gap-6 overflow-x-auto">
            <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl">
                    Wallet {truncatedAddress && (
                        <span className="text-xs sm:text-sm font-normal text-gray-500 ml-1">
                            ({truncatedAddress})
                        </span>
                    )}
                </h1>
            </div>
            <div className="flex flex-col md:flex-row items-start md:justify-between w-full gap-4 md:gap-6">
                <div className="flex flex-col items-start w-full md:w-auto">
                    <h1 className="text-sm md:text-md text-left text-[var(--foreground-secondary)]">
                        Total Assets
                    </h1>
                    <div 
                        ref={totalAssets.refs.setReference}
                        {...totalAssetsInteractions.getReferenceProps()}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        {walletLoading ? (
                            <Skeleton width="8rem" height="2rem" />
                        ) : (
                            <h1 className="text-2xl md:text-3xl font-bold">
                                {totalUsdValue}
                            </h1>
                        )}
                        <svg 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            className={`transition-transform ${totalAssetsOpen ? 'rotate-180' : ''}`}
                        >
                            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>
                <div className="flex flex-col items-start w-full md:w-auto">
                    <h1 className="text-sm md:text-md text-left text-[var(--foreground-secondary)]">
                        Morpho Vaults
                    </h1>
                    <div 
                        ref={morphoVaults.refs.setReference}
                        {...morphoVaultsInteractions.getReferenceProps()}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        {walletLoading || morphoHoldings.isLoading ? (
                            <Skeleton width="8rem" height="2rem" />
                        ) : (
                            <h1 className="text-2xl md:text-3xl font-bold">
                                {morphoUsdValue}
                            </h1>
                        )}
                        <svg 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            className={`transition-transform ${morphoVaultsOpen ? 'rotate-180' : ''}`}
                        >
                            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>
                <div className="flex flex-col items-start w-full md:w-auto">
                    <h1 className="text-sm md:text-md text-left text-[var(--foreground-secondary)]">
                        Liquid Assets
                    </h1>
                    <div 
                        ref={liquidAssets.refs.setReference}
                        {...liquidAssetsInteractions.getReferenceProps()}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        {walletLoading ? (
                            <Skeleton width="8rem" height="2rem" />
                        ) : (
                            <h1 className="text-2xl md:text-3xl font-bold">
                                {liquidUsdValue}
                            </h1>
                        )}
                        <svg 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            className={`transition-transform ${liquidAssetsOpen ? 'rotate-180' : ''}`}
                        >
                            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>
            </div>
            
            {/* Total Assets Dropdown */}
            {isMounted && totalAssetsOpen && (
                <FloatingPortal>
                    <div 
                        ref={totalAssets.refs.setFloating}
                        style={totalAssets.floatingStyles}
                        {...totalAssetsInteractions.getFloatingProps()}
                        className="bg-[var(--surface-elevated)] rounded-lg p-4 shadow-lg border border-[var(--border-subtle)] min-w-[280px] z-[9999]"
                    >
                    <div className="flex flex-col gap-3">
                        {/* Liquid Assets Total */}
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">
                                Liquid Assets
                            </span>
                            <span className="text-sm text-[var(--foreground)] font-medium whitespace-nowrap">
                                {liquidUsdValue}
                            </span>
                        </div>
                        
                        {/* Morpho Vaults Total */}
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">
                                In Morpho Vaults
                            </span>
                            <span className="text-sm text-[var(--foreground)] font-medium whitespace-nowrap">
                                {morphoUsdValue}
                            </span>
                        </div>
                        
                        {/* Total */}
                        <div className="border-t border-[var(--border-subtle)] pt-3 mt-1">
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
                                    Total Assets
                                </span>
                                <span className="text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
                                    {totalUsdValue}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                </FloatingPortal>
            )}

            {/* Liquid Assets Dropdown */}
            {isMounted && liquidAssetsOpen && (
                <FloatingPortal>
                    <div 
                        ref={liquidAssets.refs.setFloating}
                        style={liquidAssets.floatingStyles}
                        {...liquidAssetsInteractions.getFloatingProps()}
                        className="bg-[var(--surface-elevated)] rounded-lg p-4 shadow-lg border border-[var(--border-subtle)] min-w-[280px] z-[9999]"
                    >
                    <div className="flex flex-col gap-3">
                        {sortedLiquidAssets.map((asset) => (
                            <div key={asset.symbol} className="flex justify-between items-center gap-4">
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">
                                        {asset.symbol}
                                    </span>
                                    <span className="text-xs text-[var(--foreground-secondary)] whitespace-nowrap">
                                        {formatNumber(asset.formatted, {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: asset.decimals ?? 18,
                                        })}
                                    </span>
                                </div>
                                <span className="text-sm text-[var(--foreground)] font-medium whitespace-nowrap">
                                    {formatCurrency(asset.usdValue)}
                                </span>
                            </div>
                        ))}
                        <div className="border-t border-[var(--border-subtle)] pt-3 mt-1">
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
                                    Total
                                </span>
                                <span className="text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
                                    {liquidUsdValue}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                </FloatingPortal>
            )}

            {/* Morpho Vaults Dropdown */}
            {isMounted && morphoVaultsOpen && (
                <FloatingPortal>
                    <div 
                        ref={morphoVaults.refs.setFloating}
                        style={morphoVaults.floatingStyles}
                        {...morphoVaultsInteractions.getFloatingProps()}
                        className="bg-[var(--surface-elevated)] rounded-lg p-4 shadow-lg border border-[var(--border-subtle)] min-w-[280px] z-[9999]"
                    >
                    <div className="flex flex-col gap-3">
                        {morphoHoldings.isLoading ? (
                            <>
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="flex justify-between items-center gap-4">
                                        <Skeleton width="8rem" height="1rem" />
                                        <Skeleton width="5rem" height="1rem" />
                                    </div>
                                ))}
                            </>
                        ) : sortedVaultPositions.length > 0 ? (
                            sortedVaultPositions.map((position) => (
                                <div key={position.address} className="flex justify-between items-center gap-4">
                                    <span className="text-sm font-medium text-[var(--foreground)] whitespace-nowrap">
                                        {position.name}
                                    </span>
                                    <span className="text-sm text-[var(--foreground)] font-medium whitespace-nowrap">
                                        {formatCurrency(position.usdValue)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-[var(--foreground-secondary)]">
                                No vault positions
                            </div>
                        )}
                        {!morphoHoldings.isLoading && (
                            <div className="border-t border-[var(--border-subtle)] pt-3 mt-1">
                                <div className="flex justify-between items-center gap-4">
                                    <span className="text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
                                        Total
                                    </span>
                                    <span className="text-sm font-semibold text-[var(--foreground)] whitespace-nowrap">
                                        {morphoUsdValue}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                </FloatingPortal>
            )}


        </div>
    )
}