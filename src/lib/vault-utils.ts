import { VAULTS } from './vaults';
import { Vault } from '../types/vault';

/**
 * Find a vault by its address (case-insensitive)
 * @param address - The vault address to search for
 * @returns The vault if found, null otherwise
 */
export function findVaultByAddress(address: string): Vault | null {
  if (!address) return null;
  
  const normalizedAddress = address.toLowerCase().trim();
  const vault = Object.values(VAULTS).find(
    (v) => v.address.toLowerCase() === normalizedAddress
  );
  
  if (!vault) return null;
  
  return {
    address: vault.address,
    name: vault.name,
    symbol: vault.symbol,
    chainId: vault.chainId,
  };
}

/**
 * Validate if an address is a valid vault address
 * @param address - The address to validate
 * @returns True if the address is a valid vault address
 */
export function validateVaultAddress(address: string): boolean {
  return findVaultByAddress(address) !== null;
}

/**
 * Get the route path for a vault
 * @param address - The vault address
 * @returns The route path (e.g., "/vaults/0x...")
 */
export function getVaultRoute(address: string): string {
  return `/vaults/${address}`;
}

/**
 * Check if an address is a valid Ethereum address format
 * @param address - The address to check
 * @returns True if the address matches the Ethereum address format
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Calculate Y-axis domain for charts with padding
 * @param values - Array of numeric values to calculate domain from
 * @param options - Configuration options
 * @returns [min, max] domain array or undefined if no valid values
 */
export function calculateYAxisDomain(
  values: number[],
  options: {
    bottomPaddingPercent?: number; // Default: 0.25 (25%)
    topPaddingPercent?: number; // Default: 0.2 (20%)
    thresholdPercent?: number; // Default: 0.02 (2%) - percentage of max to consider "close to 0"
    defaultMin?: number; // Default: 0
    filterPositiveOnly?: boolean; // Default: false
    tokenThreshold?: number; // If provided and maxValue >= this, use different threshold for tokens
  } = {}
): [number, number] | undefined {
  const {
    bottomPaddingPercent = 0.25,
    topPaddingPercent = 0.2,
    thresholdPercent = 0.02,
    defaultMin = 0,
    filterPositiveOnly = false,
    tokenThreshold,
  } = options;

  // Filter values
  let filteredValues = values.filter(
    (v) => v !== null && v !== undefined && !isNaN(v)
  );
  
  if (filterPositiveOnly) {
    filteredValues = filteredValues.filter((v) => v > 0);
  }

  if (filteredValues.length === 0) {
    return undefined;
  }

  const minValue = Math.min(...filteredValues);
  const maxValue = Math.max(...filteredValues);

  // Determine threshold and adjustment logic
  let adjustedMinValue = minValue;
  
  if (tokenThreshold !== undefined) {
    // Token-specific logic: only adjust to 0 if max >= tokenThreshold
    if (maxValue >= tokenThreshold) {
      const threshold = maxValue * 0.01; // 1% for tokens when max >= tokenThreshold
      adjustedMinValue = minValue < threshold ? 0 : minValue;
    }
    // If max < tokenThreshold, keep the actual minValue (don't adjust to 0)
  } else {
    // Standard logic: use thresholdPercent
    const threshold = maxValue * thresholdPercent;
    adjustedMinValue = minValue < threshold ? 0 : minValue;
  }

  // Calculate padding
  const range = maxValue - adjustedMinValue;
  const bottomPadding = range * bottomPaddingPercent;
  const topPadding = range * topPaddingPercent;

  // Calculate domain
  const domainMin = Math.max(defaultMin, adjustedMinValue - bottomPadding);
  const domainMax = maxValue + topPadding;

  return [domainMin, domainMax];
}

/**
 * Derive the user's current asset balance in raw units.
 * Priority:
 * 1) position.assets (already raw)
 * 2) shares * sharePriceInAsset (tokens per share)
 * 3) shares * (totalAssets / totalSupply)
 */
export function calculateCurrentAssetsRaw(options: {
  positionAssets?: string | number | bigint | null;
  positionShares?: string | number | null;
  sharePriceInAsset?: number | null;
  totalAssets?: string | number | null;
  totalSupply?: string | number | null;
  assetDecimals?: number | null;
}): bigint {
  const {
    positionAssets,
    positionShares,
    sharePriceInAsset,
    totalAssets,
    totalSupply,
    assetDecimals = 18,
  } = options;

  // Use reported assets first
  if (positionAssets !== undefined && positionAssets !== null) {
    try {
      const assets = BigInt(positionAssets);
      if (assets > BigInt(0)) return assets;
    } catch {
      // ignore parse errors
    }
  }

  const sharesRaw = positionShares !== undefined && positionShares !== null ? (() => {
    try {
      return BigInt(positionShares);
    } catch {
      return BigInt(0);
    }
  })() : BigInt(0);

  const sharesDecimal = Number(sharesRaw) / 1e18;
  const decimals = assetDecimals ?? 18;

  const toRaw = (value: number) => {
    if (!value || !isFinite(value) || value <= 0) return BigInt(0);
    return BigInt(Math.floor(value * Math.pow(10, decimals)));
  };

  // Use provided share price in asset terms
  if (sharesDecimal > 0 && sharePriceInAsset && sharePriceInAsset > 0 && isFinite(sharePriceInAsset)) {
    const raw = toRaw(sharesDecimal * sharePriceInAsset);
    if (raw > BigInt(0)) return raw;
  }

  // Fallback: derive share price from total assets / total supply
  if (sharesDecimal > 0) {
    let totalAssetsRaw = BigInt(0);
    let totalSupplyRaw = BigInt(0);

    try {
      if (totalAssets !== undefined && totalAssets !== null) {
        totalAssetsRaw = BigInt(totalAssets);
      }
    } catch {
      // ignore parse errors
    }

    try {
      if (totalSupply !== undefined && totalSupply !== null) {
        totalSupplyRaw = BigInt(totalSupply);
      }
    } catch {
      // ignore parse errors
    }

    if (totalAssetsRaw > BigInt(0) && totalSupplyRaw > BigInt(0)) {
      const totalAssetsDecimal = Number(totalAssetsRaw) / Math.pow(10, decimals);
      const totalSupplyDecimal = Number(totalSupplyRaw) / 1e18;

      if (totalSupplyDecimal > 0 && totalAssetsDecimal > 0) {
        const sharePrice = totalAssetsDecimal / totalSupplyDecimal;
        const raw = toRaw(sharesDecimal * sharePrice);
        if (raw > BigInt(0)) return raw;
      }
    }
  }

  return BigInt(0);
}

/**
 * Resolve an asset price in USD with sensible fallbacks.
 * - Use quoted price if present
 * - Else derive from TVL/totalAssets when available
 * - Else approximate from sharePriceUsd/sharePrice if both exist
 */
export function resolveAssetPriceUsd(options: {
  quotedPriceUsd?: number | null;
  vaultData?: {
    totalValueLocked?: number;
    totalAssets?: string | number | null;
    assetDecimals?: number;
    sharePrice?: number;
  };
  fallbackSharePriceUsd?: number;
  assetDecimals?: number;
}): number {
  const { quotedPriceUsd, vaultData, fallbackSharePriceUsd, assetDecimals } = options;

  if (typeof quotedPriceUsd === 'number' && isFinite(quotedPriceUsd) && quotedPriceUsd > 0) {
    return quotedPriceUsd;
  }

  const decimals = assetDecimals ?? vaultData?.assetDecimals ?? 18;

  // Derive from totalValueLocked and totalAssets
  if (
    vaultData?.totalValueLocked &&
    typeof vaultData.totalAssets !== 'undefined' &&
    vaultData.totalAssets !== null
  ) {
    try {
      const totalAssetsRaw = BigInt(vaultData.totalAssets);
      if (totalAssetsRaw > BigInt(0)) {
        const totalAssetsDecimal = Number(totalAssetsRaw) / Math.pow(10, decimals);
        if (totalAssetsDecimal > 0) {
          return vaultData.totalValueLocked / totalAssetsDecimal;
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Approximate using share price in USD vs share price in asset terms if provided
  if (
    fallbackSharePriceUsd &&
    vaultData?.sharePrice &&
    fallbackSharePriceUsd > 0 &&
    vaultData.sharePrice > 0
  ) {
    return fallbackSharePriceUsd / vaultData.sharePrice;
  }

  return 0;
}

