// Vault type definition with all important information
export interface Vault {
    address: string;
    name: string;
    symbol: string;
    chainId: number;
    // Financial metrics
    totalValueLocked?: number; // TVL in USD
    apy?: number; // Annual Percentage Yield
    apyChange?: number; // APY change (positive/negative)
    // Risk metrics
    riskLevel?: 'low' | 'medium' | 'high';
    // Status
    status?: 'active' | 'paused' | 'deprecated';
    // Additional info
    description?: string;
    lastUpdated?: string;
    // Visual
    icon?: string;
    color?: string;
}

interface VaultListCardProps {
    vault: Vault;
    onClick?: (vault: Vault) => void;
}

export default function VaultListCard({ vault, onClick }: VaultListCardProps) {
    const formatAPY = (apy?: number) => {
        if (!apy) return 'N/A';
        return `${apy.toFixed(2)}%`;
    };

    const formatTVL = (tvl?: number) => {
        if (!tvl) return 'N/A';
        if (tvl >= 1000000) return `$${(tvl / 1000000).toFixed(1)}M`;
        if (tvl >= 1000) return `$${(tvl / 1000).toFixed(1)}K`;
        return `$${tvl.toFixed(0)}`;
    };

    const getRiskColor = (risk?: string) => {
        switch (risk) {
            case 'low': return 'text-green-500';
            case 'medium': return 'text-yellow-500';
            case 'high': return 'text-red-500';
            default: return 'text-foreground-muted';
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'active': return 'text-green-500';
            case 'paused': return 'text-yellow-500';
            case 'deprecated': return 'text-red-500';
            default: return 'text-foreground-muted';
        }
    };

    return (
        <div 
            className="flex items-center justify-between w-full hover:bg-[var(--surface-hover)] rounded-lg cursor-pointer border border-[var(--border-subtle)] transition-colors p-4"
            onClick={() => onClick?.(vault)}
        >
            {/* Left side - Vault info */}
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[var(--primary-subtle)] rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-[var(--primary)]">
                        {vault.symbol.charAt(0)}
                    </span>
                </div>
                <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-foreground">{vault.name}</h3>
                    <p className="text-xs text-foreground-secondary font-mono">
                        {`${vault.address.slice(0, 6)}...${vault.address.slice(-4)}`}
                    </p>
                </div>
            </div>

            {/* Center - Financial metrics */}
            <div className="flex items-center gap-6">
                <div className="text-center">
                    <p className="text-xs text-foreground-muted">APY</p>
                    <p className="text-sm font-semibold text-foreground">
                        {formatAPY(vault.apy)}
                        {vault.apyChange && (
                            <span className={`text-xs ml-1 ${vault.apyChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {vault.apyChange >= 0 ? '+' : ''}{vault.apyChange.toFixed(1)}%
                            </span>
                        )}
                    </p>
                </div>
                <div className="text-center">
                    <p className="text-xs text-foreground-muted">TVL</p>
                    <p className="text-sm font-semibold text-foreground">
                        {formatTVL(vault.totalValueLocked)}
                    </p>
                </div>
            </div>

            {/* Right side - Status and risk */}
            <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                    <span className={`text-xs ${getStatusColor(vault.status)}`}>
                        {vault.status || 'active'}
                    </span>
                    <span className={`text-xs ${getRiskColor(vault.riskLevel)}`}>
                        {vault.riskLevel || 'medium'}
                    </span>
                </div>
            </div>
        </div>
    )
}