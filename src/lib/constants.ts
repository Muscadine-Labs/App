/**
 * Application-wide constants
 */

// Chain configuration
export const BASE_CHAIN_ID = 8453 as const;
export const BASE_WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;
export const GENERAL_ADAPTER_ADDRESS = '0xb98c948CFA24072e58935BC004a8A7b376AE746A' as const;

// Cache durations (in milliseconds)
export const CACHE_DURATION_VAULT_DATA = 5 * 60 * 1000; // 5 minutes
export const CACHE_DURATION_PRICES = 10 * 60 * 1000; // 10 minutes
export const CACHE_DURATION_ACTIVITY = 60 * 1000; // 1 minute

// Transaction configuration
export const GAS_RESERVE_ETH = '0.0001'; // ETH to reserve for gas fees
export const MAX_WITHDRAW_QUEUE_ITEMS = 30; // Maximum items to fetch from withdraw queue

// Request timeouts
export const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

// Price API configuration
export const STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'DAI'] as const;
export const DEFAULT_ASSET_PRICE = 1;
export const DEFAULT_ASSET_DECIMALS = 18;
