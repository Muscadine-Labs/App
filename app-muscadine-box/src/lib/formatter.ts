import { formatUnits, type Address } from 'viem';

/**
 * A flexible, locale-aware number formatter.
 * @param value - The number or string to format.
 * @param options - Intl.NumberFormat options (e.g., { maximumFractionDigits: 2 }).
 * @returns A formatted number string.
 */
export function formatNumber(
  value: number | string,
  options: Intl.NumberFormatOptions = {}
): string {
  const numberValue = Number(value);
  if (isNaN(numberValue)) return ''; // Return empty string for invalid numbers
  
  return new Intl.NumberFormat('en-US', options).format(numberValue);
}

/**
 * A specialized formatter for currency values.
 * @param value - The number or string to format.
 * @param options - Additional Intl.NumberFormat options.
 * @returns A formatted currency string (e.g., "$1,234.56" or "$1.2M").
 */
export function formatCurrency(
  value: number | string,
  options: Intl.NumberFormatOptions = {}
): string {
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options, // User options will override defaults
  };
  return formatNumber(value, defaultOptions);
}

/**
 * Formats a raw BigInt token amount from a smart contract into a readable string.
 * @param value - The BigInt or string value from the contract.
 * @param decimals - The token's decimals (e.g., 18 for ETH, 6 for USDC).
 * @param options - Intl.NumberFormat options for the final display.
 * @returns A formatted token amount string.
 */
export function formatTokenAmount(
  value: bigint | string,
  decimals: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const decimalValue = formatUnits(BigInt(value), decimals);
  return formatNumber(decimalValue, options);
}

/**
 * Smart currency formatter that shows the most appropriate format based on value size.
 * @param value - The number or string to format.
 * @returns A formatted currency string with appropriate precision (e.g., "$20", "$1.2K", "$2.5M").
 */
export function formatSmartCurrency(value: number | string): string {
  const numberValue = Number(value);
  if (isNaN(numberValue)) return '$0';
  
  const absValue = Math.abs(numberValue);
  
  if (absValue < 1000) {
    // Show exact amount for values under $1,000
    return `$${numberValue.toFixed(2)}`;
  } else if (absValue < 1000000) {
    // Show in thousands with 1 decimal place
    return `$${(numberValue / 1000).toFixed(1)}K`;
  } else if (absValue < 1000000000) {
    // Show in millions with 1 decimal place
    return `$${(numberValue / 1000000).toFixed(1)}M`;
  } else {
    // Show in billions with 1 decimal place
    return `$${(numberValue / 1000000000).toFixed(1)}B`;
  }
}

/**
 * Formats asset amounts with appropriate precision based on token type.
 * @param value - The asset amount (in wei or smallest unit).
 * @param decimals - The token's decimals.
 * @param symbol - The token symbol.
 * @returns A formatted asset amount string (e.g., "1.5 WETH", "0.25 cbBTC").
 */
export function formatAssetAmount(
  value: bigint | string,
  decimals: number,
  symbol: string,
  options: Intl.NumberFormatOptions = {}
): string {
  const decimalValue = formatUnits(BigInt(value), decimals);
  const numberValue = Number(decimalValue);
  
  if (isNaN(numberValue)) return `0 ${symbol}`;
  
  // Set appropriate precision based on token type
  const defaultOptions: Intl.NumberFormatOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: symbol === 'WETH' ? 4 : symbol === 'cbBTC' ? 6 : 2,
    ...options,
  };
  
  const formattedAmount = formatNumber(numberValue, defaultOptions);
  return `${formattedAmount} ${symbol}`;
}

/**
 * Gets the display precision for a token symbol.
 * This centralizes the precision rules used across the app.
 * @param symbol - The token symbol (case-insensitive).
 * @param assetDecimals - The actual token decimals (fallback for unknown tokens).
 * @returns The number of decimal places to display.
 */
export function getTokenDisplayPrecision(symbol: string, assetDecimals?: number): number {
  const upperSymbol = symbol.toUpperCase();
  
  // Stablecoins use 2 decimal places for display (even though USDC has 6 decimals)
  if (upperSymbol === 'USDC' || upperSymbol === 'USDT' || upperSymbol === 'DAI') {
    return 2;
  }
  
  // Use actual token decimals for other tokens
  return assetDecimals ?? 18;
}

/**
 * Formats asset amounts for display with safe rounding-down behavior.
 * Ensures formatted value never exceeds the original (important for balance displays and validation).
 * 
 * @param value - The decimal amount (already converted from BigInt).
 * @param options - Formatting options.
 * @returns Formatted string without symbol (caller adds symbol if needed).
 */
export function formatAssetAmountSafe(
  value: number,
  options: {
    decimals: number;
    symbol?: string; // Optional, for determining display precision
    roundMode?: 'down' | 'nearest'; // Default: 'down' for safety
    trimZeros?: boolean; // Default: true
    minDisplayable?: number; // For edge case handling (defaults to 1 / 10^decimals)
  }
): string {
  if (value <= 0) {
    return '0';
  }
  
  const {
    decimals,
    symbol,
    roundMode = 'down',
    trimZeros = true,
    minDisplayable,
  } = options;
  
  // Determine display precision
  const displayPrecision = symbol 
    ? getTokenDisplayPrecision(symbol, decimals)
    : decimals;
  
  const precisionMultiplier = Math.pow(10, displayPrecision);
  
  // Round down or nearest based on mode
  const rounded = roundMode === 'down'
    ? Math.floor(value * precisionMultiplier) / precisionMultiplier
    : Math.round(value * precisionMultiplier) / precisionMultiplier;
  
  // Handle edge case: if rounded to 0 but value is close to minimum displayable unit
  const minDisplay = minDisplayable ?? (1 / precisionMultiplier);
  const normalizedValue = (rounded === 0 && value >= minDisplay * 0.99)
    ? minDisplay
    : rounded;
  
  // Format with full precision first
  let formatted = normalizedValue.toFixed(displayPrecision);
  
  // Trim trailing zeros if requested
  if (trimZeros && formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '');
  }
  
  return formatted === '' ? '0' : formatted;
}

/**
 * Formats asset amounts for input/transaction use.
 * Preserves full contract decimals precision (no trimming) to ensure
 * parseUnits can accurately reconstruct the exact amount.
 * 
 * @param value - The decimal amount (already converted from BigInt).
 * @param decimals - The contract decimals (e.g., 18 for ETH, 6 for USDC).
 * @param roundMode - How to round the value (default: 'down' for safety).
 * @returns Formatted string with full precision, suitable for parseUnits.
 */
export function formatAssetAmountForInput(
  value: number,
  decimals: number,
  roundMode: 'down' | 'nearest' = 'down'
): string {
  if (value <= 0) {
    return '0';
  }
  
  const precisionMultiplier = Math.pow(10, decimals);
  
  // Round down or nearest based on mode
  const rounded = roundMode === 'down'
    ? Math.floor(value * precisionMultiplier) / precisionMultiplier
    : Math.round(value * precisionMultiplier) / precisionMultiplier;
  
  // Format with full contract decimals precision (no trimming)
  // This ensures parseUnits can accurately reconstruct the exact amount
  return rounded.toFixed(decimals);
}

/**
 * Truncates an Ethereum address for concise display.
 * @param address - The full address string.
 * @returns A truncated address string (e.g., "0x1234...5678").
 */
export function truncateAddress(address?: Address): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}