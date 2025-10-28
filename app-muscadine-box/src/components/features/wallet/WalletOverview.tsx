'use client';

import { useAppKitAccount, useWalletInfo } from '@reown/appkit/react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { formatNumber, formatCurrency } from '@/lib/formatter';
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
    const { address, isConnected } = useAppKitAccount();
    const { walletInfo } = useWalletInfo();
    const { totalUsdValue, liquidUsdValue, morphoUsdValue, tokenBalances, loading: walletLoading } = useWallet();
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
            <div className="flex flex-col items-center justify-center w-full h-full bg-[var(--surface)] rounded-lg px-8 py-4 gap-6">
                <div className="animate-pulse">
                    <div className="h-8 w-48 bg-[var(--background-elevated)] rounded mb-4"></div>
                    <div className="h-4 w-64 bg-[var(--background-elevated)] rounded"></div>
                </div>
            </div>
        );
    }

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center w-full h-full bg-[var(--surface)] rounded-lg px-8 py-4 gap-6">
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
    
    // Find the asset with the highest USD value for liquid assets (for dropdown display)
    const sortedLiquidAssets = [...tokenBalances].sort((a, b) => b.usdValue - a.usdValue);
    

    return (
        <div className="flex flex-col items-start justify-start w-full h-full bg-[var(--surface)] rounded-lg px-8 py-4 gap-6 overflow-x-auto">
            <div className="flex items-center gap-2">
                {walletInfo?.icon && (
                    <Image 
                        src={walletInfo.icon} 
                        alt={walletInfo.name || 'Wallet'} 
                        width={24} 
                        height={24} 
                        className="rounded-full"
                    />
                )}
                <h1>
                    Wallet {truncatedAddress && (
                        <span className="text-sm font-normal text-gray-500 ml-1">
                            ({truncatedAddress})
                        </span>
                    )}
                </h1>
            </div>
            <div className="flex items-start justify-between w-full">
                <div className="flex flex-col items-start">
                        <h1 className="text-md text-left text-[var(--foreground-secondary)]">
                            Total Assets
                        </h1>
                    
                    <div 
                        ref={totalAssets.refs.setReference}
                        {...totalAssetsInteractions.getReferenceProps()}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <h1 className="text-3xl font-bold">
                            {walletLoading ? 'Loading...' : totalUsdValue}
                        </h1>
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
                <div className="flex flex-col items-start">
                    
                        <h1 className="text-md text-left text-[var(--foreground-secondary)]">
                            Liquid Assets
                        </h1>
              
                    <div 
                        ref={liquidAssets.refs.setReference}
                        {...liquidAssetsInteractions.getReferenceProps()}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <h1 className="text-3xl font-bold">
                            {walletLoading ? 'Loading...' : liquidUsdValue}
                        </h1>
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
                <div className="flex flex-col items-start">
                        <h1 className="text-md text-left text-[var(--foreground-secondary)]">
                           In Morpho Vaults
                        </h1>
                   <div 
                        ref={morphoVaults.refs.setReference}
                        {...morphoVaultsInteractions.getReferenceProps()}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                       <h1 className="text-3xl font-bold text-[var(--success)]">
                           {walletLoading ? 'Loading...' : morphoUsdValue}
                       </h1>
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
            </div>
            
            {/* Total Assets Dropdown */}
            {isMounted && totalAssetsOpen && (
                <FloatingPortal>
                    <div 
                        ref={totalAssets.refs.setFloating}
                        style={totalAssets.floatingStyles}
                        {...totalAssetsInteractions.getFloatingProps()}
                        className="bg-[var(--surface-elevated)] rounded-lg p-3 shadow-lg border border-[var(--border-subtle)] min-w-[200px] z-[9999]"
                    >
                    <div className="flex flex-col gap-2">
                        {/* Liquid Assets Section */}
                        <div className="text-xs text-[var(--foreground-secondary)] mb-1">
                            Liquid Assets
                        </div>
                        {sortedLiquidAssets.map((asset) => (
                            <div key={asset.symbol} className="flex justify-between items-center py-1">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-[var(--foreground)]">
                                        {asset.symbol}
                                    </span>
                                    <span className="text-xs text-[var(--foreground-secondary)]">
                                        {formatNumber(asset.formatted, {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: asset.symbol === 'ETH' ? 4 : 2,
                                        })}
                                    </span>
                                </div>
                                <span className="text-sm text-[var(--foreground)]">
                                    {formatCurrency(asset.usdValue)}
                                </span>
                            </div>
                        ))}
                        
                        {/* Vault Assets Section */}
                        <div className="border-t border-[var(--border-subtle)] pt-2 mt-2">
                            <div className="text-xs text-[var(--foreground-secondary)] mb-1">
                                In Vaults
                            </div>
                            <div className="flex justify-between items-center py-1">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-[var(--foreground)]">
                                        Vault Positions
                                    </span>
                                    
                                </div>
                                <span className="text-sm text-[var(--success)]">
                                    {morphoUsdValue}
                                </span>
                            </div>
                        </div>
                        
                        {/* Total */}
                        <div className="border-t border-[var(--border-subtle)] pt-2 mt-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-[var(--foreground)]">
                                    Total Assets
                                </span>
                                <span className="text-sm font-semibold text-[var(--foreground)]">
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
                        className="bg-[var(--surface-elevated)] rounded-lg p-3 shadow-lg border border-[var(--border-subtle)] min-w-[200px] z-[9999]"
                    >
                    <div className="flex flex-col gap-2">
                        {sortedLiquidAssets.map((asset) => (
                            <div key={asset.symbol} className="flex justify-between items-center py-1">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-[var(--foreground)]">
                                        {asset.symbol}
                                    </span>
                                    <span className="text-xs text-[var(--foreground-secondary)]">
                                        {formatNumber(asset.formatted, {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: asset.symbol === 'ETH' ? 4 : 2,
                                        })}
                                    </span>
                                </div>
                                <span className="text-sm text-[var(--foreground)]">
                                    {formatCurrency(asset.usdValue)}
                                </span>
                            </div>
                        ))}
                        <div className="border-t border-[var(--border-subtle)] pt-2 mt-1">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-[var(--foreground)]">
                                    Total
                                </span>
                                <span className="text-sm font-semibold text-[var(--foreground)]">
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
                        className="bg-[var(--surface-elevated)] rounded-lg p-3 shadow-lg border border-[var(--border-subtle)] min-w-[200px] z-[9999]"
                    >
                    <div className="flex flex-col gap-2">
                        <div className="text-sm text-[var(--foreground-secondary)]">
                            Vault positions coming soon...
                        </div>
                        <div className="border-t border-[var(--border-subtle)] pt-2 mt-1">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-[var(--foreground)]">
                                    Total
                                </span>
                                <span className="text-sm font-semibold text-[var(--foreground)]">
                                    {morphoUsdValue}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                </FloatingPortal>
            )}

        </div>
    )
}