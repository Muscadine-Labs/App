import { Vault, MorphoVaultData, getVaultLogo } from '../types/vault';
import Link from "next/link";
import Image from "next/image";

interface VaultDetailedProps {
    selectedVault: Vault | null;
}

// Example data for demonstration
const getExampleVaultData = (vault: Vault): MorphoVaultData => ({
    // General Information
    name: vault.name,
    symbol: vault.symbol,
    address: vault.address,
    chainId: vault.chainId,
    curator: 'Morpho Labs',
    curatorAddress: '0x1234567890123456789012345678901234567890',
    description: 'High-yield lending vault optimized for stablecoin deposits with automated market allocation.',
    
    // Stats
    totalValueLocked: vault.totalValueLocked || 2500000,
    apy: vault.apy || 8.45,
    apyChange: 0.25,
    totalDeposits: 3200000,
    currentLiquidity: 1800000,
    sharePrice: 1.0245,
    performanceFee: 10.0,
    managementFee: 0.5,
    
    // Risk
    riskLevel: vault.riskLevel || 'medium',
    collateralizationRatio: 1.85,
    liquidationThreshold: 0.85,
    maxLTV: 0.75,
    timelockDuration: 24,
    guardianAddress: '0x9876543210987654321098765432109876543210',
    oracleAddress: '0x4567890123456789012345678901234567890123',
    allocatedMarkets: ['USDC/USDC', 'WETH/USDC', 'WBTC/USDC'],
    status: vault.status || 'active'
});

export default function VaultDetailed({ selectedVault }: VaultDetailedProps) {
    if (!selectedVault) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <p className="text-[var(--foreground-muted)] text-sm">
                    Select a vault to view details
                </p>
            </div>
        );
    }

    const vaultData = getExampleVaultData(selectedVault);

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
                            <span className="text-sm font-mono text-[var(--foreground)]">
                                {vaultData.address.slice(0, 6)}...{vaultData.address.slice(-4)}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Curator</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                {vaultData.curator}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Chain</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                Base (Chain ID: {vaultData.chainId})
                            </span>
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
                                ${(vaultData.totalValueLocked / 1000000).toFixed(2)}M
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">APY</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-[var(--success)]">
                                    {vaultData.apy.toFixed(2)}%
                                </span>
                                <span className={`text-xs ${
                                    vaultData.apyChange >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                                }`}>
                                    {vaultData.apyChange >= 0 ? '+' : ''}{vaultData.apyChange.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Total Deposits</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                ${(vaultData.totalDeposits / 1000000).toFixed(2)}M
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Current Liquidity</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                ${(vaultData.currentLiquidity / 1000000).toFixed(2)}M
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Share Price</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                ${vaultData.sharePrice.toFixed(4)}
                            </span>
                        </div>
                        
                        
                    </div>
                </div>

                {/* Risk Section */}
                <div className="flex flex-col gap-4">
                    <div className="border-b border-[var(--border-subtle)] pb-2">
                        <h3 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide">
                            Risk Assessment
                        </h3>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Risk Level</span>
                            <span className={`text-sm font-medium capitalize px-2 py-1 rounded-full ${
                                vaultData.riskLevel === 'low' ? 'bg-[var(--success-subtle)] text-[var(--success)]' :
                                vaultData.riskLevel === 'medium' ? 'bg-[var(--warning-subtle)] text-[var(--warning)]' :
                                'bg-[var(--danger-subtle)] text-[var(--danger)]'
                            }`}>
                                {vaultData.riskLevel}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Collateralization Ratio</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                {vaultData.collateralizationRatio.toFixed(2)}x
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Liquidation Threshold</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                {(vaultData.liquidationThreshold * 100).toFixed(1)}%
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--foreground-secondary)]">Max LTV</span>
                            <span className="text-sm font-medium text-[var(--foreground)]">
                                {(vaultData.maxLTV * 100).toFixed(1)}%
                            </span>
                        </div>
                        
                        
                        
                    </div>
                </div>
            </div>

            {/* Interact Button */}
            <div className="mt-auto pt-4">
                <Link 
                    href={`/vaults?address=${selectedVault.address}`}
                    className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium py-3 px-4 rounded-lg transition-colors text-center block"
                >
                    Interact with Vault
                </Link>
            </div>
        </div>
    );
}