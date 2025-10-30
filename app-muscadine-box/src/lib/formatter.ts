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
 * Truncates an Ethereum address for concise display.
 * @param address - The full address string.
 * @returns A truncated address string (e.g., "0x1234...5678").
 */
export function truncateAddress(address?: Address): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}