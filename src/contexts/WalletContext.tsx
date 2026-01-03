'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
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

  // Fetch vault positions using GraphQL API first (accurate) then Alchemy as fallback
  const fetchVaultPositions = useCallback(async (alchemyBalances: TokenBalance[]): Promise<void> => {
    if (!address) {
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
      
      // Step 1: Fetch GraphQL API first (primary source, most accurate)
      logger.debug('Fetching vault positions from GraphQL API (primary source)', {
        address,
        timestamp: new Date().toISOString(),
      });

      const graphqlPositionPromises = vaults.map(async (vaultInfo) => {
        try {
          // Fetch position from GraphQL API
          const positionResponse = await fetch(
            `/api/vaults/${vaultInfo.address}/position-history?chainId=${vaultInfo.chainId}&userAddress=${address}&period=all`
          );
          
          if (!positionResponse.ok) {
            return null;
          }
          
          const positionData = await positionResponse.json();
          
          if (!positionData?.currentPosition) {
            return null;
          }
          
          const currentPos = positionData.currentPosition;
          
          // Skip if no position (check assetsUsd first as it's most reliable)
          if (!currentPos.assetsUsd || currentPos.assetsUsd === 0) {
            // Also check assets and shares as fallback
            if ((!currentPos.assets || currentPos.assets === 0) && (!currentPos.shares || currentPos.shares === 0)) {
              return null;
            }
          }
          
          // Fetch vault metadata to get vault info
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
            
            // Convert raw values to proper format
            // API returns assets and shares in raw format (already in wei/smallest unit)
            // Convert to string for consistency with VaultPosition interface
            const assetsRaw = typeof currentPos.assets === 'string' 
              ? currentPos.assets
              : (typeof currentPos.assets === 'number' ? Math.floor(currentPos.assets).toString() : '0');
            const sharesRaw = typeof currentPos.shares === 'string' 
              ? currentPos.shares
              : (typeof currentPos.shares === 'number' ? Math.floor(currentPos.shares).toString() : '0');
            
            // Use assetsUsd directly from API (most accurate)
            const assetsUsd = typeof currentPos.assetsUsd === 'number' 
              ? currentPos.assetsUsd 
              : undefined;
            
            const position: VaultPosition = {
              vault: {
                address: vaultInfo.address,
                name: vaultInfoData.name || vaultInfo.name,
                symbol: vaultInfoData.asset?.symbol || vaultInfo.symbol,
                state: {
                  sharePriceUsd,
                  totalAssetsUsd,
                  totalSupply,
                },
              },
              shares: sharesRaw,
              assets: assetsRaw,
              assetsUsd, // Store assetsUsd from GraphQL API for accurate USD calculations
            };
          
          return position;
        } catch (err) {
          logger.warn('Failed to fetch vault position from GraphQL API', {
            vaultAddress: vaultInfo.address,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      });
      
      // Fetch GraphQL positions first (primary source, awaited)
      const graphqlPositions = await Promise.all(graphqlPositionPromises);
      const positions = graphqlPositions.filter((pos): pos is VaultPosition => pos !== null);
      
      // Update state immediately with GraphQL data (primary source)
      if (positions.length > 0) {
        // Calculate total USD value using assetsUsd when available (most accurate)
        const totalValueUsd = positions.reduce((sum, position) => {
          if (position.assetsUsd !== undefined && position.assetsUsd > 0) {
            return sum + position.assetsUsd;
          }
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

        logger.info('Vault positions fetched from GraphQL API', {
          positionCount: positions.length,
          totalValueUsd: totalValueUsd.toFixed(2),
          timestamp: new Date().toISOString(),
        });
      } else {
        // No GraphQL positions found, set empty state
        setMorphoHoldings({
          totalValueUsd: 0,
          positions: [],
          isLoading: false,
          error: null,
        });
      }

      // Step 2: Use Alchemy as fallback/enhancement in background (only if GraphQL missed any positions)
      logger.debug('Enhancing vault positions with Alchemy (fallback)', {
        address,
        alchemyBalanceCount: alchemyBalances.length,
        timestamp: new Date().toISOString(),
      });

      // Create a map of vault addresses for quick lookup
      const vaultAddressMap = new Map<string, typeof VAULTS[keyof typeof VAULTS]>();
      Object.values(VAULTS).forEach(vault => {
        vaultAddressMap.set(vault.address.toLowerCase(), vault);
      });

      // Find vault share token balances from Alchemy balances
      const vaultShareBalances = alchemyBalances.filter(token => 
        vaultAddressMap.has(token.address.toLowerCase())
      );

      if (vaultShareBalances.length > 0) {
        const alchemyPositionPromises = vaultShareBalances.map(async (tokenBalance) => {
          const vaultInfo = vaultAddressMap.get(tokenBalance.address.toLowerCase())!;
          const sharesWei = tokenBalance.balance;
          const sharesDecimal = parseFloat(tokenBalance.formatted);

          // Skip if no shares
          if (sharesWei === BigInt(0) || sharesDecimal <= 0) {
            return null;
          }

          // Skip if we already have this position from GraphQL
          const existingPosition = positions.find(pos => 
            pos.vault.address.toLowerCase() === vaultInfo.address.toLowerCase()
          );
          if (existingPosition) {
            return null; // GraphQL already has this position
          }

          try {
            // Fetch vault metadata from API to get share price and other info
            const response = await fetch(`/api/vaults/${vaultInfo.address}/complete?chainId=${vaultInfo.chainId}`);
            if (!response.ok) {
              throw new Error(`Failed to fetch vault data: ${response.status}`);
            }

            const data = await response.json();
            const vaultData = data.data?.vaultByAddress;

            if (!vaultData) {
              throw new Error('Invalid vault data response');
            }

            const sharePriceUsd = vaultData.state?.sharePriceUsd || 0;
            const totalAssetsUsd = vaultData.state?.totalAssetsUsd || 0;
            const totalSupply = vaultData.state?.totalSupply || '0';
            
            // Calculate assets from shares using share price
            const assetDecimals = getVaultAssetDecimals(vaultInfo.address, vaultData.asset?.symbol || vaultInfo.symbol);
            const totalSupplyDecimal = parseFloat(totalSupply) / 1e18;
            const totalAssetsDecimal = parseFloat(vaultData.state?.totalAssets || '0') / Math.pow(10, assetDecimals);
            const sharePriceInAsset = totalSupplyDecimal > 0 ? totalAssetsDecimal / totalSupplyDecimal : 0;
            const assetsDecimal = sharesDecimal * sharePriceInAsset;
            const assetsWei = BigInt(Math.floor(assetsDecimal * Math.pow(10, assetDecimals)));

            const position: VaultPosition = {
              vault: {
                address: vaultInfo.address,
                name: vaultData.name || vaultInfo.name,
                symbol: vaultData.asset?.symbol || vaultInfo.symbol,
                state: {
                  sharePriceUsd,
                  totalAssetsUsd,
                  totalSupply,
                },
              },
              shares: sharesWei.toString(),
              assets: assetsWei.toString(),
            };
            return position;
          } catch (err) {
            logger.warn('Failed to fetch vault position from Alchemy (fallback)', {
              vaultAddress: vaultInfo.address,
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          }
        });

        // Fetch Alchemy positions in background and merge with GraphQL positions
        Promise.all(alchemyPositionPromises).then(alchemyPositions => {
          const newAlchemyPositions = alchemyPositions.filter((pos): pos is VaultPosition => pos !== null);
          
          if (newAlchemyPositions.length > 0) {
            // Merge Alchemy positions with existing GraphQL positions
            const positionMap = new Map<string, VaultPosition>();
            
            // Start with existing GraphQL positions (primary)
            positions.forEach(pos => {
              positionMap.set(pos.vault.address.toLowerCase(), pos);
            });
            
            // Add Alchemy positions only if they don't already exist (fallback)
            newAlchemyPositions.forEach(alchemyPos => {
              if (!positionMap.has(alchemyPos.vault.address.toLowerCase())) {
                positionMap.set(alchemyPos.vault.address.toLowerCase(), alchemyPos);
              }
            });
            
            const mergedPositions = Array.from(positionMap.values());
            
            // Calculate total USD value using assetsUsd when available (most accurate)
            const totalValueUsd = mergedPositions.reduce((sum, position) => {
              if (position.assetsUsd !== undefined && position.assetsUsd > 0) {
                return sum + position.assetsUsd;
              }
              const shares = parseFloat(position.shares) / 1e18;
              const sharePriceUsd = position.vault.state.sharePriceUsd || 0;
              return sum + (shares * sharePriceUsd);
            }, 0);

            setMorphoHoldings({
              totalValueUsd,
              positions: mergedPositions,
              isLoading: false,
              error: null,
            });

            logger.info('Vault positions enhanced with Alchemy fallback data', {
              positionCount: mergedPositions.length,
              alchemyFallbackCount: newAlchemyPositions.length,
              totalValueUsd: totalValueUsd.toFixed(2),
              timestamp: new Date().toISOString(),
            });
          }
        }).catch(err => {
          logger.warn('Failed to enhance vault positions with Alchemy data (non-critical)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
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
  }, [address]);

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
        // Fetch vault positions using GraphQL first (accurate) then Alchemy as fallback
        await fetchVaultPositions(alchemyBalances);
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
    
    // Fetch vault positions using GraphQL first (accurate) then Alchemy as fallback
    await fetchVaultPositions(alchemyBalances);
    
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

    await fetchVaultPositions(alchemyBalances);
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
