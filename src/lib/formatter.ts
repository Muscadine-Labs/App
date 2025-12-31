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
  // Use the asset's actual decimals, defaulting to 18 if not provided
  const maxPrecision = assetDecimals ?? 18;
  
  // For string inputs, try to work with the string directly for better precision
  // Only parse to number when necessary
  let numValue: number;
  let balanceStr: string;
  
  if (typeof balance === 'string') {
    balanceStr = balance.trim();
    if (balanceStr === '' || balanceStr === '0') {
      return includeSymbol ? `0.00 ${symbol}` : '0.00';
    }
    numValue = parseFloat(balanceStr);
  } else {
    numValue = balance;
    balanceStr = balance.toString();
  }
  
  if (isNaN(numValue) || numValue < 0) {
    return includeSymbol ? `0.00 ${symbol}` : '0.00';
  }
  
  // Check if value is zero - use string check for accuracy when available
  if (typeof balance === 'string') {
    // Check the original string to see if it's truly zero (handles very small numbers that might round to 0)
    const isZeroPattern = /^0+\.?0*$/.test(balanceStr);
    if (isZeroPattern) {
      return includeSymbol ? `0.00 ${symbol}` : '0.00';
    }
  }
  
  // Check if value is zero
  if (numValue === 0 || (Math.abs(numValue) < 1e-18)) {
    // For extremely small values that round to 0, check if original string had content
    if (typeof balance === 'string' && balanceStr && !/^0+\.?0*$/.test(balanceStr)) {
      // String has non-zero content, continue
    } else {
      return includeSymbol ? `0.00 ${symbol}` : '0.00';
    }
  }
  
  let precision: number;
  
  // Always find the first significant digit to determine precision
  // This works for both small and large numbers
  let decimalPlaces = 0;
  let temp = Math.abs(numValue);
  precision = maxPrecision; // Default to full precision
  
  // Find first significant digit for values less than 1
  if (temp > 0 && temp < 1) {
    while (temp < 1 && decimalPlaces < maxPrecision) {
      temp *= 10;
      decimalPlaces++;
      if (temp >= 1 || decimalPlaces >= maxPrecision) {
        // Found first significant digit at decimalPlaces position
        // Show first significant digit plus 2-4 more places for clarity, up to max precision
        precision = Math.min(decimalPlaces + 4, maxPrecision);
        break;
      }
    }
  } else {
    // For values >= 1, use full precision up to maxPrecision
    precision = maxPrecision;
  }
  
  // Format with calculated precision
  const formatted = numValue.toFixed(precision);
  
  // Remove trailing zeros, but keep at least one digit after decimal if there was a decimal point
  const trimmed = formatted.includes('.') 
    ? formatted.replace(/0+$/, '').replace(/\.$/, '')
    : formatted;
  
  return includeSymbol ? `${trimmed} ${symbol}` : trimmed;
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
  
  // For input fields, preserve full precision based on asset decimals
  // Use the asset's actual decimals, defaulting to 18 if not provided
  const precision = assetDecimals ?? 18;
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


/**
 * Truncates an Ethereum address for concise display.
 * @param address - The full address string.
 * @returns A truncated address string (e.g., "0x1234...5678").
 */
export function truncateAddress(address?: Address): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}