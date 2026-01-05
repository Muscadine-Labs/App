// Unified Vault type definition
export interface Vault {
    // Basic Information
    address: string;
    name: string;
    symbol: string;
    chainId: number;
    version?: 'v1' | 'v2'; // Vault version (v1 uses Morpho v1 API, v2 uses Morpho v2 API)
    
    // Financial Metrics
    totalValueLocked?: number; // TVL in USD
    totalAssets?: string; // Total assets in native units (wei)
    totalSupply?: string; // Total supply of vault shares (in wei)
    assetDecimals?: number; // Asset decimals for formatting
    apy?: number; // Annual Percentage Yield (net)
    netApyWithoutRewards?: number; // Net APY without reward incentives
    rewardsApr?: number; // Rewards APR from incentives
    rewardSymbol?: string; // Symbol of reward token
    apyChange?: number; // APY change (positive/negative)
    totalDeposits?: number; // Total deposits in USD
    currentLiquidity?: number; // Available liquidity in USD
    sharePrice?: number; // Current vault share price (in tokens, not USD)
    sharePriceUsd?: number; // Current vault share price in USD
    
    // Security & Risk
    whitelisted?: boolean; // Whether vault is whitelisted by Morpho
    timelockDuration?: number; // Timelock in seconds
    
    // Status
    status?: 'active' | 'paused' | 'deprecated';
    
    // Curator Information
    curator?: string;
    curatorAddress?: string;
    guardianAddress?: string;
    oracleAddress?: string;
    ownerAddress?: string; // Vault owner address
    
    // Allocators
    allocators?: string[]; // Array of allocator addresses
    
    // Fees
    performanceFee?: number; // Percentage
    managementFee?: number; // Percentage
    
    // Market Information
    allocatedMarkets?: string[];
    // Market assets with addresses for logo fetching
    marketAssets?: Array<{
        symbol: string;
        address?: string;
    }>;
    
    // Additional Info
    description?: string;
    lastUpdated?: string;
    
    // Visual Properties
    icon?: string;
    color?: string;
}

// Extended vault data structure for Morpho vaults (includes all possible fields)
export interface MorphoVaultData extends Vault {
    // All fields are required for Morpho vaults
    totalValueLocked: number;
    totalSupply: string; // Total supply of vault shares (in wei)
    apy: number;
    netApyWithoutRewards: number;
    rewardsApr: number;
    rewardSymbol: string;
    apyChange: number;
    totalDeposits: number;
    currentLiquidity: number;
    sharePrice: number; // Share price in tokens (not USD)
    sharePriceUsd: number; // Share price in USD
    whitelisted: boolean;
    timelockDuration: number;
    guardianAddress: string;
    oracleAddress: string;
    ownerAddress: string;
    allocators: string[];
    allocatedMarkets: string[];
    status: 'active' | 'paused' | 'deprecated';
    curator: string;
    curatorAddress: string;
    performanceFee: number;
    managementFee: number;
    description: string;
}

// Vault symbol to logo mapping
export const VAULT_LOGO_MAP: Record<string, string> = {
    'USDC': '/usdc-logo.svg',
    'WETH': '/eth-logo.svg',
    'ETH': '/eth-logo.svg',
    'CBTC': '/btc-logo.svg',
    'cbbtc': '/btc-logo.svg', // Handle uppercase conversion
    'CBBTC': '/btc-logo.svg',
    'cbBTC': '/btc-logo.svg',
    'BTC': '/btc-logo.svg',
} as const;

// Function to get vault logo
export const getVaultLogo = (symbol: string): string => {
    // Try exact match first, then uppercase
    return VAULT_LOGO_MAP[symbol] || VAULT_LOGO_MAP[symbol.toUpperCase()] || '/usdc-logo.svg';
};

// Vault status colors
export const VAULT_STATUS_COLORS = {
    active: 'text-[var(--success)]',
    paused: 'text-[var(--warning)]',
    deprecated: 'text-[var(--foreground-muted)]',
} as const;

// Risk level colors
export const RISK_LEVEL_COLORS = {
    low: 'bg-[var(--success-subtle)] text-[var(--success)]',
    medium: 'bg-[var(--warning-subtle)] text-[var(--warning)]',
    high: 'bg-[var(--danger-subtle)] text-[var(--danger)]',
} as const;

// Account types for transaction flow
export type AccountType = 'wallet' | 'vault';

export interface WalletAccount {
    type: 'wallet';
    address: 'wallet';
    symbol: string;
    balance: bigint;
    assetAddress?: string; // For token balances
}

export interface VaultAccount {
    type: 'vault';
    address: string;
    name: string;
    symbol: string;
    balance: bigint; // User's vault shares or withdrawable assets
    assetAddress: string; // Underlying asset address
    assetDecimals: number;
}

export type Account = WalletAccount | VaultAccount;
