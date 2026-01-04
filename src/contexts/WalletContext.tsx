'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useBalance, useReadContract } from 'wagmi';
import type { AlchemyTokenBalancesResponse, AlchemyTokenMetadataResponse, AlchemyTokenBalance } from '@/types/api';
import { formatCurrency } from '@/lib/formatter';
import { logger } from '@/lib/logger';
import { VAULTS } from '@/lib/vaults';

export interface TokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  formatted: string;
  usdValue: number;
}

interface VaultPosition {
  vault: {
    address: string;
    name: string;
    symbol: string;
    state: {
      sharePriceUsd: number;
      totalAssetsUsd: number;
      totalSupply: string;
    };
  };
  shares: string;
  assets?: string;
  assetsUsd?: number; // USD value from GraphQL API (most accurate)
}

interface MorphoHoldings {
  totalValueUsd: number;
  positions: VaultPosition[];
  isLoading: boolean;
  error: string | null;
}

interface WalletContextType {
  ethBalance: string;
  ethUsdValue: string;
  totalUsdValue: string;
  liquidUsdValue: string;
  morphoUsdValue: string;
  tokenBalances: TokenBalance[];
  morphoHoldings: MorphoHoldings;
  loading: boolean;
  error: string | null;
  refreshBalances: () => Promise<void>;
  refreshBalancesWithRetry: (options?: { maxRetries?: number; retryDelay?: number }) => Promise<void>;
  refreshBalancesWithPolling: (options?: { maxAttempts?: number; intervalMs?: number; onComplete?: () => void }) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Major token addresses on Base
const TOKEN_ADDRESSES = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  cbBTC: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // Coinbase Wrapped BTC on Base
  WETH: '0x4200000000000000000000000000000000000006', // Wrapped ETH on Base
} as const;

// ERC20 ABI for balanceOf, decimals, and symbol
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [alchemyTokenBalances, setAlchemyTokenBalances] = useState<TokenBalance[]>([]);
  const [morphoHoldings, setMorphoHoldings] = useState<MorphoHoldings>({
    totalValueUsd: 0,
    positions: [],
    isLoading: false,
    error: null,
  });
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  
  // Debounced wallet state to prevent rapid state changes during auth flows
  const [stableIsConnected, setStableIsConnected] = useState(isConnected);
  const [stableAddress, setStableAddress] = useState(address);

  // Debounce wallet state changes to prevent clearing data during auth flows
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setStableIsConnected(isConnected);
      setStableAddress(address);
    }, 100); // 100ms debounce

    return () => clearTimeout(timeoutId);
  }, [isConnected, address]);

  // Get ETH balance
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address: address as `0x${string}`,
    query: { enabled: !!address }
  });

  // Wagmi contract reads - used as fallback only when Alchemy doesn't return token data
  // Disabled by default to avoid redundant RPC calls (Alchemy is primary source)
  const [needsWagmiFallback, setNeedsWagmiFallback] = useState<{
    usdc: boolean;
    cbbtc: boolean;
    weth: boolean;
  }>({ usdc: false, cbbtc: false, weth: false });

  // Get token balances for major tokens (fallback only)
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address && needsWagmiFallback.usdc }
  });

  const { data: cbbtcBalance, refetch: refetchCbbtcBalance } = useReadContract({
    address: TOKEN_ADDRESSES.cbBTC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address && needsWagmiFallback.cbbtc }
  });

  const { data: wethBalance, refetch: refetchWethBalance } = useReadContract({
    address: TOKEN_ADDRESSES.WETH,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address && needsWagmiFallback.weth }
  });

  // Get token decimals (fallback only - Alchemy provides decimals)
  const { data: usdcDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address && needsWagmiFallback.usdc }
  });

  const { data: cbbtcDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.cbBTC,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address && needsWagmiFallback.cbbtc }
  });

  const { data: wethDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.WETH,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address && needsWagmiFallback.weth }
  });

  // Fetch token prices dynamically
  const fetchTokenPrices = useCallback(async (symbols: string[]) => {
    try {
      const symbolsParam = symbols.join(',');
      const response = await fetch(`/api/prices?symbols=${symbolsParam}`);
      const data = await response.json();
      return data;
    } catch {
      return {};
    }
  }, []);

  // Fetch all token balances using Alchemy API (more reliable than individual contract calls)
  const fetchAllTokenBalances = useCallback(async (): Promise<TokenBalance[]> => {
    if (!address) return [];

    const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    if (!alchemyApiKey) {
      return [];
    }

    try {
      const response = await fetch(
        `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenBalances',
            params: [address, 'erc20'],
          }),
        }
      );

      const data = await response.json() as AlchemyTokenBalancesResponse;
      
      if (data.error) {
        return [];
      }

      const tokenAddresses = data.result?.tokenBalances || [];
      

      // Fetch metadata for each token in parallel
      const tokenMetadataPromises = tokenAddresses
        .filter((token: AlchemyTokenBalance) => {
          const balance = BigInt(token.tokenBalance || '0');
          return balance > BigInt(0); // Only process tokens with non-zero balance
        })
        .map(async (token: AlchemyTokenBalance) => {
          try {
            const metadataResponse = await fetch(
              `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'alchemy_getTokenMetadata',
                  params: [token.contractAddress],
                }),
              }
            );

            const metadataData = await metadataResponse.json() as AlchemyTokenMetadataResponse;
            
            if (metadataData.error || !metadataData.result) {
              return null;
            }

            const balance = BigInt(token.tokenBalance || '0');
            const decimals = metadataData.result.decimals || 18;
            const symbol = metadataData.result.symbol || 'UNKNOWN';
            const formatted = (Number(balance) / Math.pow(10, decimals)).toString();


            return {
              address: token.contractAddress,
              symbol,
              decimals,
              balance,
              formatted,
              usdValue: 0, // Will be calculated later with prices
            };
          } catch {
            return null;
          }
        });

      const metadataResults = await Promise.all(tokenMetadataPromises);
      return metadataResults.filter((result): result is TokenBalance => result !== null);
    } catch {
      return [];
    }
  }, [address]);

  // Helper to get asset decimals for a vault (USDC=6, WETH/ETH=18, cbBTC=8)
  const getVaultAssetDecimals = (vaultAddress: string, vaultSymbol: string): number => {
    const symbol = vaultSymbol.toUpperCase();
    // USDC vault uses 6 decimals
    if (symbol === 'USDC' || symbol === 'MVUSDC' || vaultAddress.toLowerCase() === '0xf7e26Fa48A568b8b0038e104DfD8ABdf0f99074F'.toLowerCase()) {
      return 6;
    }
    // cbBTC vault uses 8 decimals
    if (symbol === 'CBBTC' || symbol === 'MVCBBTC' || vaultAddress.toLowerCase() === '0xAeCc8113a7bD0CFAF7000EA7A31afFD4691ff3E9'.toLowerCase()) {
      return 8;
    }
    // WETH/ETH uses 18 decimals
    return 18;
  };

  // Fetch vault positions using RPC calls (balanceOf + convertToAssets)
  const fetchVaultPositions = useCallback(async (): Promise<void> => {
    if (!address || !publicClient) {
      setMorphoHoldings(prev => ({ 
        ...prev, 
        totalValueUsd: 0, 
        positions: [],
        isLoading: false 
      }));
      return;
    }

    setMorphoHoldings(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const vaults = Object.values(VAULTS);
      
      logger.debug('Fetching vault positions from RPC (balanceOf + convertToAssets)', {
        address,
        timestamp: new Date().toISOString(),
      });

      // ERC20 ABI for balanceOf
      const ERC20_BALANCE_ABI = [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ] as const;

      // ERC4626 ABI for convertToAssets
      const ERC4626_ABI = [
        {
          inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
          name: 'convertToAssets',
          outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      const rpcPositionPromises = vaults.map(async (vaultInfo) => {
        try {
          // Step 1: Get shares using balanceOf
          const sharesRaw = await publicClient.readContract({
            address: vaultInfo.address as `0x${string}`,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          }) as bigint;

          // Skip if no shares
          if (!sharesRaw || sharesRaw === BigInt(0)) {
            return null;
          }

          // Step 2: Convert shares to assets using convertToAssets
          const assetsRaw = await publicClient.readContract({
            address: vaultInfo.address as `0x${string}`,
            abi: ERC4626_ABI,
            functionName: 'convertToAssets',
            args: [sharesRaw],
          }) as bigint;

          // Step 3: Fetch vault metadata to get vault info (for sharePriceUsd, etc.)
          const vaultResponse = await fetch(`/api/vaults/${vaultInfo.address}/complete?chainId=${vaultInfo.chainId}`);
          if (!vaultResponse.ok) {
            return null;
          }
          
          const vaultData = await vaultResponse.json();
          const vaultInfoData = vaultData.data?.vaultByAddress;
          
          if (!vaultInfoData) {
            return null;
          }

          const sharePriceUsd = vaultInfoData.state?.sharePriceUsd || 0;
          const totalAssetsUsd = vaultInfoData.state?.totalAssetsUsd || 0;
          const totalSupply = vaultInfoData.state?.totalSupply || '0';
          
          // Step 4: Calculate USD value using asset price (like liquid assets)
          const assetSymbol = vaultInfoData.asset?.symbol || vaultInfo.symbol;
          const assetDecimals = getVaultAssetDecimals(vaultInfo.address, assetSymbol);
          const assetsDecimal = Number(assetsRaw) / Math.pow(10, assetDecimals);
          
          // Get asset price from prices API (same as liquid assets)
          let assetPrice = 0;
          if (assetSymbol.toUpperCase() === 'USDC' || assetSymbol.toUpperCase() === 'USDT' || assetSymbol.toUpperCase() === 'DAI') {
            assetPrice = 1; // Stablecoins are $1
          } else {
            // Map symbols to price API symbols
            const priceSymbolMap: Record<string, string> = {
              'WETH': 'ETH',
              'cbBTC': 'BTC',
              'CBBTC': 'BTC',
              'CBTC': 'BTC',
            };
            const priceSymbol = priceSymbolMap[assetSymbol.toUpperCase()] || assetSymbol;
            
            try {
              const priceResponse = await fetch(`/api/prices?symbols=${priceSymbol}`);
              if (priceResponse.ok) {
                const priceData = await priceResponse.json();
                const priceKey = priceSymbol.toLowerCase();
                assetPrice = priceData[priceKey] || 0;
              }
            } catch {
              // If price fetch fails, use sharePriceUsd as fallback
              const sharesDecimal = Number(sharesRaw) / 1e18;
              if (sharesDecimal > 0 && sharePriceUsd > 0) {
                assetPrice = sharePriceUsd / (assetsDecimal / sharesDecimal);
              }
            }
          }
          
          const assetsUsd = assetsDecimal * assetPrice;

          const position: VaultPosition = {
            vault: {
              address: vaultInfo.address,
              name: vaultInfoData.name || vaultInfo.name,
              symbol: assetSymbol,
              state: {
                sharePriceUsd,
                totalAssetsUsd,
                totalSupply,
              },
            },
            shares: sharesRaw.toString(),
            assets: assetsRaw.toString(),
            assetsUsd, // Calculate USD value from asset amount * price (like liquid assets)
          };
          
          return position;
        } catch (err) {
          logger.warn('Failed to fetch vault position from RPC', {
            vaultAddress: vaultInfo.address,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      });
      
      // Fetch all positions from RPC
      const rpcPositions = await Promise.all(rpcPositionPromises);
      const positions = rpcPositions.filter((pos): pos is VaultPosition => pos !== null);
      
      // Calculate total USD value using assetsUsd (calculated from asset amount * price)
      const totalValueUsd = positions.reduce((sum, position) => {
        if (position.assetsUsd !== undefined && position.assetsUsd > 0) {
          return sum + position.assetsUsd;
        }
        // Fallback: use shares * sharePriceUsd if assetsUsd not available
        const shares = parseFloat(position.shares) / 1e18;
        const sharePriceUsd = position.vault.state.sharePriceUsd || 0;
        return sum + (shares * sharePriceUsd);
      }, 0);

      setMorphoHoldings({
        totalValueUsd,
        positions,
        isLoading: false,
        error: null,
      });

      logger.info('Vault positions fetched from RPC', {
        positionCount: positions.length,
        totalValueUsd: totalValueUsd.toFixed(2),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Failed to fetch vault positions', err instanceof Error ? err : new Error(String(err)), {
        address,
      });
      setMorphoHoldings(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: err instanceof Error ? err.message : 'Failed to fetch vault positions' 
      }));
    }
  }, [address, publicClient]);

  // Stable wallet state management - only clear data on actual disconnect
  useEffect(() => {
    if (stableIsConnected && stableAddress) {
      // Only fetch when actually connected with an address
      const fetchAllData = async () => {
        // Fetch all token balances from Alchemy first (primary source)
        const alchemyBalances = await fetchAllTokenBalances();
        setAlchemyTokenBalances(alchemyBalances);

        // Check if Alchemy returned key tokens - enable wagmi fallback only if missing
        const hasUsdc = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.USDC.toLowerCase());
        const hasCbbtc = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.cbBTC.toLowerCase());
        const hasWeth = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.WETH.toLowerCase());
        
        setNeedsWagmiFallback({
          usdc: !hasUsdc,
          cbbtc: !hasCbbtc,
          weth: !hasWeth,
        });

        // Get unique symbols for price fetching
        const symbols = new Set<string>(['ETH', 'USDC']);
        alchemyBalances.forEach(token => {
          const symbol = token.symbol.toUpperCase();
          if (symbol === 'CBBTC' || symbol === 'CBTC') {
            symbols.add('CBBTC');
          } else if (symbol === 'WETH') {
            symbols.add('WETH');
          } else {
            symbols.add(symbol);
          }
        });

        // Fetch prices for all tokens
        const prices = await fetchTokenPrices(Array.from(symbols));
        setTokenPrices({
          eth: prices.eth || 0,
          usdc: prices.usdc || 1, // USDC is pegged to $1
          cbbtc: prices.cbbtc || prices.btc || 0, // cbBTC uses BTC price
          weth: prices.weth || prices.eth || 0, // WETH uses ETH price
          usdt: prices.usdt || 1, // USDT is pegged to $1
          dai: prices.dai || 1, // DAI is pegged to $1
          ...Object.fromEntries(
            Object.entries(prices).map(([key, value]) => [key.toLowerCase(), value])
          ),
        });
        // Fetch vault positions using RPC (balanceOf + convertToAssets)
        await fetchVaultPositions();
      };
      
      fetchAllData();
    } else if (!stableIsConnected) {
      // Only clear data when explicitly disconnected (not during auth flows)
      setMorphoHoldings(prev => ({ 
        ...prev, 
        totalValueUsd: 0, 
        positions: [],
        isLoading: false 
      }));
      setTokenPrices({});
      setAlchemyTokenBalances([]);
    }
    // Don't include fetchVaultPositions and fetchTokenPrices in deps to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableIsConnected, stableAddress, fetchAllTokenBalances]);

  const refreshBalances = useCallback(async () => {
    // Refetch ETH balance (always needed)
    if (address && refetchEthBalance) {
      await refetchEthBalance();
    }

    // Fetch all token balances from Alchemy (primary source)
    const alchemyBalances = await fetchAllTokenBalances();
    setAlchemyTokenBalances(alchemyBalances);

    // Check if Alchemy returned key tokens - enable wagmi fallback only if missing
    const hasUsdc = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.USDC.toLowerCase());
    const hasCbbtc = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.cbBTC.toLowerCase());
    const hasWeth = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.WETH.toLowerCase());
    
    setNeedsWagmiFallback({
      usdc: !hasUsdc,
      cbbtc: !hasCbbtc,
      weth: !hasWeth,
    });

    // Only refetch wagmi hooks if fallback is needed
    const refetchPromises = [];
    if (address) {
      if (!hasUsdc && refetchUsdcBalance) refetchPromises.push(refetchUsdcBalance());
      if (!hasCbbtc && refetchCbbtcBalance) refetchPromises.push(refetchCbbtcBalance());
      if (!hasWeth && refetchWethBalance) refetchPromises.push(refetchWethBalance());
    }
    await Promise.all(refetchPromises);

    const symbols = new Set<string>(['ETH', 'USDC']);
    alchemyBalances.forEach(token => {
      const symbol = token.symbol.toUpperCase();
      if (symbol === 'CBBTC' || symbol === 'CBTC') {
        symbols.add('CBBTC');
      } else if (symbol === 'WETH') {
        symbols.add('WETH');
      } else {
        symbols.add(symbol);
      }
    });

    const prices = await fetchTokenPrices(Array.from(symbols));
    setTokenPrices({
      eth: prices.eth || 0,
      usdc: prices.usdc || 1,
      cbbtc: prices.cbbtc || prices.btc || 0,
      weth: prices.weth || prices.eth || 0,
      usdt: prices.usdt || 1,
      dai: prices.dai || 1,
      ...Object.fromEntries(
        Object.entries(prices).map(([key, value]) => [key.toLowerCase(), value])
      ),
    });
    
    // Log USDC balance specifically for debugging
    const usdcBalance = alchemyBalances.find(t => t.symbol.toUpperCase() === 'USDC');
    logger.debug('Token balances and prices updated', {
      alchemyBalanceCount: alchemyBalances.length,
      tokenCount: symbols.size,
      usdcBalance: usdcBalance ? {
        symbol: usdcBalance.symbol,
        balance: usdcBalance.balance.toString(),
        formatted: usdcBalance.formatted,
        decimals: usdcBalance.decimals,
      } : 'not found',
      allTokens: alchemyBalances.map(t => ({
        symbol: t.symbol,
        formatted: t.formatted,
        balance: t.balance.toString(),
      })),
      timestamp: new Date().toISOString(),
    });
    
    // Fetch vault positions using RPC (balanceOf + convertToAssets)
    await fetchVaultPositions();
    
    logger.info('Balance refresh completed', {
      timestamp: new Date().toISOString(),
      note: 'Check detailed logs above for fetched values - state updates asynchronously via React',
    });
  }, [fetchTokenPrices, fetchVaultPositions, fetchAllTokenBalances, refetchEthBalance, refetchUsdcBalance, refetchCbbtcBalance, refetchWethBalance, address]);

  // Helper function to sleep/delay
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Core refresh logic (extracted for reuse)
  const performRefresh = useCallback(async (): Promise<void> => {
    // Refetch ETH balance (always needed)
    if (address && refetchEthBalance) {
      await refetchEthBalance();
    }

    // Fetch all token balances from Alchemy (primary source)
    const alchemyBalances = await fetchAllTokenBalances();
    setAlchemyTokenBalances(alchemyBalances);

    // Check if Alchemy returned key tokens - enable wagmi fallback only if missing
    const hasUsdc = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.USDC.toLowerCase());
    const hasCbbtc = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.cbBTC.toLowerCase());
    const hasWeth = alchemyBalances.some(t => t.address.toLowerCase() === TOKEN_ADDRESSES.WETH.toLowerCase());
    
    setNeedsWagmiFallback({
      usdc: !hasUsdc,
      cbbtc: !hasCbbtc,
      weth: !hasWeth,
    });

    // Only refetch wagmi hooks if fallback is needed
    const refetchPromises = [];
    if (address) {
      if (!hasUsdc && refetchUsdcBalance) refetchPromises.push(refetchUsdcBalance());
      if (!hasCbbtc && refetchCbbtcBalance) refetchPromises.push(refetchCbbtcBalance());
      if (!hasWeth && refetchWethBalance) refetchPromises.push(refetchWethBalance());
    }
    await Promise.all(refetchPromises);

    const symbols = new Set<string>(['ETH', 'USDC']);
    alchemyBalances.forEach(token => {
      const symbol = token.symbol.toUpperCase();
      if (symbol === 'CBBTC' || symbol === 'CBTC') {
        symbols.add('CBBTC');
      } else if (symbol === 'WETH') {
        symbols.add('WETH');
      } else {
        symbols.add(symbol);
      }
    });

    const prices = await fetchTokenPrices(Array.from(symbols));
    setTokenPrices({
      eth: prices.eth || 0,
      usdc: prices.usdc || 1,
      cbbtc: prices.cbbtc || prices.btc || 0,
      weth: prices.weth || prices.eth || 0,
      usdt: prices.usdt || 1,
      dai: prices.dai || 1,
      ...Object.fromEntries(
        Object.entries(prices).map(([key, value]) => [key.toLowerCase(), value])
      ),
    });

    await fetchVaultPositions();
  }, [fetchTokenPrices, fetchVaultPositions, fetchAllTokenBalances, refetchEthBalance, refetchUsdcBalance, refetchCbbtcBalance, refetchWethBalance, address]);

  // Refresh with retry logic (exponential backoff)
  const refreshBalancesWithRetry = useCallback(async (options?: { maxRetries?: number; retryDelay?: number }) => {
    const maxRetries = options?.maxRetries ?? 3;
    const baseRetryDelay = options?.retryDelay ?? 1000; // 1 second base delay

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await performRefresh();
        if (attempt > 0) {
          logger.info('Balance refresh succeeded after retry', {
            attempt: attempt + 1,
            maxRetries,
            timestamp: new Date().toISOString(),
          });
        }
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          const delay = baseRetryDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          logger.warn('Balance refresh failed, retrying', {
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
            error: lastError.message,
            timestamp: new Date().toISOString(),
          });
          await sleep(delay);
        } else {
          logger.error('Balance refresh failed after all retries', lastError, {
            maxRetries,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
    throw lastError || new Error('Balance refresh failed');
  }, [performRefresh]);

  // Refresh with polling (useful for transaction completion)
  const refreshBalancesWithPolling = useCallback(async (options?: { maxAttempts?: number; intervalMs?: number; onComplete?: () => void }) => {
    const maxAttempts = options?.maxAttempts ?? 10;
    const intervalMs = options?.intervalMs ?? 3000; // 3 seconds default

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await performRefresh();
        logger.info('Balance refresh completed via polling', {
          attempt: attempt + 1,
          maxAttempts,
          timestamp: new Date().toISOString(),
        });
        options?.onComplete?.();
        return; // Success
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxAttempts - 1) {
          logger.debug('Balance refresh polling attempt failed, will retry', {
            attempt: attempt + 1,
            maxAttempts,
            intervalMs,
            error: err.message,
            timestamp: new Date().toISOString(),
          });
          await sleep(intervalMs);
        } else {
          logger.error('Balance refresh polling failed after all attempts', err, {
            maxAttempts,
            timestamp: new Date().toISOString(),
          });
          throw err;
        }
      }
    }
  }, [performRefresh]);

  // Calculate balances and USD values
  const ethFormatted = ethBalance ? parseFloat(ethBalance.formatted) : 0;
  const ethUsdValue = ethFormatted * (tokenPrices.eth || 0);
  
  // Calculate token balances with proper decimals
  const usdcDecimalsValue = usdcDecimals || 6;
  const usdcFormatted = usdcBalance ? Number(usdcBalance) / Math.pow(10, usdcDecimalsValue) : 0;
  const usdcUsdValue = usdcFormatted * (tokenPrices.usdc || 1);
  
  const cbbtcDecimalsValue = cbbtcDecimals || 8;
  const cbbtcFormatted = cbbtcBalance ? Number(cbbtcBalance) / Math.pow(10, cbbtcDecimalsValue) : 0;
  const cbbtcUsdValue = cbbtcFormatted * (tokenPrices.cbbtc || 0);
  
  const wethDecimalsValue = wethDecimals || 18;
  const wethFormatted = wethBalance ? Number(wethBalance) / Math.pow(10, wethDecimalsValue) : 0;
  const wethUsdValue = wethFormatted * (tokenPrices.weth || tokenPrices.eth || 0);
  
  // USDT and DAI USD values are calculated but not currently used in the final token balances array
  // They're kept here for potential future use
  // const usdtDecimalsValue = usdtDecimals || 6;
  // const usdtFormatted = usdtBalance ? Number(usdtBalance) / Math.pow(10, usdtDecimalsValue) : 0;
  // const usdtUsdValue = usdtFormatted * (tokenPrices.usdt || 1);
  
  // const daiDecimalsValue = daiDecimals || 18;
  // const daiFormatted = daiBalance ? Number(daiBalance) / Math.pow(10, daiDecimalsValue) : 0;
  // const daiUsdValue = daiFormatted * (tokenPrices.dai || 1);

  // Build token balances array - combine ETH, manually fetched tokens, and Alchemy tokens
  // Calculate USD values for Alchemy tokens
  const alchemyBalancesWithPrices = alchemyTokenBalances.map(token => {
    const symbolUpper = token.symbol.toUpperCase();
    let price = 0;
    
    // Map token symbols to price keys
    if (symbolUpper === 'CBBTC' || symbolUpper === 'CBTC') {
      price = tokenPrices.cbbtc || tokenPrices.btc || 0;
    } else if (symbolUpper === 'WETH') {
      price = tokenPrices.weth || tokenPrices.eth || 0;
    } else if (symbolUpper === 'USDC') {
      price = tokenPrices.usdc || 1;
    } else if (symbolUpper === 'USDT') {
      price = tokenPrices.usdt || 1;
    } else if (symbolUpper === 'DAI') {
      price = tokenPrices.dai || 1;
    } else {
      // Try to find price by symbol (case insensitive)
      price = tokenPrices[symbolUpper.toLowerCase()] || tokenPrices[token.symbol.toLowerCase()] || 0;
    }
    
    const usdValue = parseFloat(token.formatted) * price;
    
    return {
      ...token,
      usdValue,
    };
  });

  // Combine all token balances - Alchemy is primary, wagmi is fallback only
  const allTokenBalances: TokenBalance[] = [
    // ETH (native)
    {
      address: 'ETH',
      symbol: 'ETH',
      decimals: 18,
      balance: ethBalance?.value || BigInt(0),
      formatted: ethBalance?.formatted || '0',
      usdValue: ethUsdValue,
    },
    // Alchemy tokens (primary source - includes USDC, cbBTC, WETH if available)
    ...alchemyBalancesWithPrices,
    // Wagmi fallback tokens (only if Alchemy didn't return them)
    ...(usdcBalance && usdcBalance > BigInt(0) && !alchemyBalancesWithPrices.find(t => t.address.toLowerCase() === TOKEN_ADDRESSES.USDC.toLowerCase()) ? [{
      address: TOKEN_ADDRESSES.USDC,
      symbol: 'USDC',
      decimals: usdcDecimalsValue,
      balance: usdcBalance,
      formatted: usdcFormatted.toString(),
      usdValue: usdcUsdValue,
    }] : []),
    ...(cbbtcBalance && cbbtcBalance > BigInt(0) && !alchemyBalancesWithPrices.find(t => t.address.toLowerCase() === TOKEN_ADDRESSES.cbBTC.toLowerCase()) ? [{
      address: TOKEN_ADDRESSES.cbBTC,
      symbol: 'cbBTC',
      decimals: cbbtcDecimalsValue,
      balance: cbbtcBalance,
      formatted: cbbtcFormatted.toString(),
      usdValue: cbbtcUsdValue,
    }] : []),
    ...(wethBalance && wethBalance > BigInt(0) && !alchemyBalancesWithPrices.find(t => t.address.toLowerCase() === TOKEN_ADDRESSES.WETH.toLowerCase()) ? [{
      address: TOKEN_ADDRESSES.WETH,
      symbol: 'WETH',
      decimals: wethDecimalsValue,
      balance: wethBalance,
      formatted: wethFormatted.toString(),
      usdValue: wethUsdValue,
    }] : []),
  ];

  // Remove duplicates and filter to only non-zero balances (for total calculation)
  const allValidTokenBalances = allTokenBalances
    .filter((token, index, self) => 
      token.balance > BigInt(0) && 
      index === self.findIndex(t => t.address.toLowerCase() === token.address.toLowerCase())
    );

  // Calculate liquid assets from ALL token balances (including dust tokens for accurate total)
  const liquidUsdValue = allValidTokenBalances.reduce((sum, token) => sum + token.usdValue, 0);

  // Show all tokens with non-zero balances (removed $1 filter to show small balances like 0.00000005 BTC)
  const tokenBalances = allValidTokenBalances
    .sort((a, b) => b.usdValue - a.usdValue);
  
  // Calculate total value (liquid + Morpho vaults)
  const totalUsdValue = liquidUsdValue + morphoHoldings.totalValueUsd;

  const value: WalletContextType = {
    ethBalance: ethBalance?.formatted || '0',
    ethUsdValue: formatCurrency(ethUsdValue),
    totalUsdValue: formatCurrency(totalUsdValue),
    liquidUsdValue: formatCurrency(liquidUsdValue),
    morphoUsdValue: formatCurrency(morphoHoldings.totalValueUsd),
    tokenBalances, // Now includes all major tokens with non-zero balances
    morphoHoldings,
    loading,
    error,
    refreshBalances,
    refreshBalancesWithRetry,
    refreshBalancesWithPolling,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
