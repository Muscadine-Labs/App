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

