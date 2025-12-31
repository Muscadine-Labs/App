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
 * @param assetDecimals - Optional asset decimals (used to determine precision if symbol doesn't match known patterns).
 * @returns The number of decimal places to display.
 */
export function getTokenDisplayPrecision(symbol: string, assetDecimals?: number): number {
  const upperSymbol = symbol.toUpperCase();
  
  // ETH and WETH use 4 decimal places
  if (upperSymbol === 'ETH' || upperSymbol === 'WETH') {
    return 4;
  }
  
  // cbBTC uses 6 decimal places
  if (upperSymbol === 'CBBTC' || upperSymbol === 'CBTC') {
    return 6;
  }
  
  // Stablecoins use 2 decimal places for display (even though USDC has 6 decimals)
  if (upperSymbol === 'USDC' || upperSymbol === 'USDT' || upperSymbol === 'DAI') {
    return 2;
  }
  
  // For other tokens, determine precision based on asset decimals
  if (assetDecimals === 6) {
    return 2; // USDC-like tokens
  } else if (assetDecimals === 8) {
    return 4; // BTC-like tokens
  } else {
    return 4; // Default for 18-decimal tokens (WETH, etc.)
  }
}

/**
 * Formats BigInt balance directly to input string format.
 * This avoids floating-point precision issues by working directly with BigInt.
 * 
 * @param balance - The BigInt balance from the contract.
 * @param decimals - The contract decimals (e.g., 18 for ETH, 6 for USDC, 8 for BTC).
 * @returns Formatted string with full precision, suitable for parseUnits.
 */
export function formatBigIntForInput(
  balance: bigint,
  decimals: number
): string {
  if (balance === BigInt(0)) {
    return '0';
  }
  
  // Use formatUnits directly - this is the most accurate way to convert BigInt to decimal string
  // formatUnits handles the conversion without any floating-point precision loss
  return formatUnits(balance, decimals);
}

/**
 * Formats asset balance for display (unified function for both wallet and vault balances).
 * Uses appropriate precision based on symbol and asset decimals.
 * For small amounts, shows more precision to avoid rounding to zero.
 * @param balance - The balance value (string or number).
 * @param symbol - The asset symbol (e.g., 'ETH', 'WETH', 'USDC', 'cbBTC').
 * @param assetDecimals - Optional asset decimals (used to determine precision if symbol doesn't match known patterns).
 * @param includeSymbol - Whether to include the symbol in the output (default: true).
 * @returns Formatted balance string (e.g., "1.2345 ETH" or "1.23" if includeSymbol is false).
 */
export function formatAssetBalance(
  balance: string | number,
  symbol: string,
  assetDecimals?: number,
  includeSymbol: boolean = true
): string {
  const numValue = typeof balance === 'string' ? parseFloat(balance || '0') : balance;
  if (isNaN(numValue) || numValue <= 0) {
    return includeSymbol ? `0.00 ${symbol}` : '0.00';
  }
  
  const basePrecision = getTokenDisplayPrecision(symbol, assetDecimals);
  
  // For small amounts (< 0.01), show more precision to avoid rounding to zero
  // Find the first significant digit and show at least 6 significant digits total
  if (numValue < 0.01) {
    // Count leading zeros after decimal point
    const str = numValue.toString();
    const decimalIndex = str.indexOf('.');
    if (decimalIndex !== -1) {
      const afterDecimal = str.substring(decimalIndex + 1);
      let leadingZeros = 0;
      for (let i = 0; i < afterDecimal.length; i++) {
        if (afterDecimal[i] === '0') {
          leadingZeros++;
        } else {
          break;
        }
      }
      // Show at least 6 significant digits: leading zeros + significant digits
      const precision = Math.max(leadingZeros + 6, basePrecision);
      const formatted = numValue.toFixed(precision);
      // Remove trailing zeros but keep at least basePrecision decimals
      const trimmed = parseFloat(formatted).toFixed(Math.max(precision, basePrecision));
      return includeSymbol ? `${trimmed} ${symbol}` : trimmed;
    }
  }
  
  const formatted = numValue.toFixed(basePrecision);
  
  return includeSymbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Formats available balance for display in input fields.
 * Shows "Available: X SYMBOL" format.
 * @param balance - The balance value (string or number).
 * @param symbol - The asset symbol.
 * @param assetDecimals - Optional asset decimals for vault assets.
 * @returns Formatted string (e.g., "Available: 1.2345 ETH" or "Available: 1.23 USDC").
 */
export function formatAvailableBalance(
  balance: string | number,
  symbol: string,
  assetDecimals?: number
): string {
  const formatted = formatAssetBalance(balance, symbol, assetDecimals, true);
  return `Available: ${formatted}`;
}

/**
 * Formats asset amount for MAX button (input field).
 * Returns just the number without symbol, suitable for input fields.
 * For input fields, we preserve full precision to avoid rounding issues.
 * @param amount - The amount as a number.
 * @param symbol - The asset symbol.
 * @param assetDecimals - Optional asset decimals.
 * @returns Formatted string suitable for input field with full precision (e.g., "1.234567890123456789").
 */
export function formatAssetAmountForMax(
  amount: number,
  symbol: string,
  assetDecimals?: number
): string {
  if (amount <= 0) return '0';
  
  // For input fields, preserve full precision to avoid rounding to zero for small amounts
  // Convert to string with enough precision, then remove trailing zeros
  const effectiveDecimals = assetDecimals ?? 18; // Default to 18 for ETH/WETH
  const precision = Math.min(effectiveDecimals, 18); // Cap at 18 decimals
  const formatted = amount.toFixed(precision);
  
  // Remove trailing zeros and unnecessary decimal point
  return formatted.replace(/\.?0+$/, '') || '0';
}

// Legacy aliases for backward compatibility
/** @deprecated Use formatAssetBalance instead */
export function formatWalletBalance(balance: string | number, symbol: string): string {
  return formatAssetBalance(balance, symbol, undefined, true);
}

/** @deprecated Use formatAssetBalance instead */
export function formatVaultAssetBalance(
  assetAmount: number,
  assetDecimals: number,
  symbol: string
): string {
  return formatAssetBalance(assetAmount, symbol, assetDecimals, true);
}

/** @deprecated Use getTokenDisplayPrecision instead */
export function getTokenDisplayPrecisionDigits(symbol: string): number {
  return getTokenDisplayPrecision(symbol);
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