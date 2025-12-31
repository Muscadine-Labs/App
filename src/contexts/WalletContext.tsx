'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useBalance, useReadContract } from 'wagmi';
import type { AlchemyTokenBalancesResponse, AlchemyTokenMetadataResponse, AlchemyTokenBalance, MorphoUserVaultPositions, MorphoVaultPosition, GraphQLResponse } from '@/types/api';

interface TokenBalance {
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
  refreshBalances: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Major token addresses on Base
const TOKEN_ADDRESSES = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  cbBTC: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // Coinbase Wrapped BTC on Base
  WETH: '0x4200000000000000000000000000000000000006', // Wrapped ETH on Base
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // USDT on Base
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI on Base
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
  const { data: ethBalance } = useBalance({
    address: address as `0x${string}`,
    query: { enabled: !!address }
  });

  // Get token balances for major tokens
  const { data: usdcBalance } = useReadContract({
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  });

  const { data: cbbtcBalance } = useReadContract({
    address: TOKEN_ADDRESSES.cbBTC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  });

  const { data: wethBalance } = useReadContract({
    address: TOKEN_ADDRESSES.WETH,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  });

  // USDT and DAI balances are fetched but not currently used in calculations
  // Kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: _usdtBalance } = useReadContract({
    address: TOKEN_ADDRESSES.USDT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: _daiBalance } = useReadContract({
    address: TOKEN_ADDRESSES.DAI,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  });

  // Get token decimals
  const { data: usdcDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address }
  });

  const { data: cbbtcDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.cbBTC,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address }
  });

  const { data: wethDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.WETH,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address }
  });

  // USDT and DAI decimals are fetched but not currently used in calculations
  // Kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: usdtDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.USDT,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: daiDecimals } = useReadContract({
    address: TOKEN_ADDRESSES.DAI,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!address }
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

  // Fetch Morpho vault holdings
  const fetchMorphoHoldings = useCallback(async () => {
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
      const response = await fetch(`https://api.morpho.org/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query UserVaultHoldings($userAddress: String!, $chainId: Int!) {
              userByAddress(address: $userAddress, chainId: $chainId) {
                vaultPositions {
                  vault {
                    address
                    name
                    symbol
                    state {
                      sharePriceUsd
                      totalAssetsUsd
                      totalSupply
                    }
                  }
                  shares
                  assets
                }
              }
            }
          `,
          variables: {
            userAddress: address,
            chainId: 8453, // Base
          },
        }),
      });

      const data = await response.json() as GraphQLResponse<MorphoUserVaultPositions>;
      
      if (data.data?.userByAddress?.vaultPositions) {
        // Filter out positions with zero shares
        const positions = data.data.userByAddress.vaultPositions.filter(
          (pos: MorphoVaultPosition) => parseFloat(pos.shares) > 0
        );
        
        const totalValueUsd = positions.reduce((sum: number, position: MorphoVaultPosition) => {
          const shares = parseFloat(position.shares) / 1e18;
          const sharePriceUsd = position.vault.state?.sharePriceUsd || 0;
          return sum + (shares * sharePriceUsd);
        }, 0);

        setMorphoHoldings({
          totalValueUsd,
          positions,
          isLoading: false,
          error: null,
        });
      } else {
        setMorphoHoldings(prev => ({ 
          ...prev, 
          totalValueUsd: 0, 
          positions: [], 
          isLoading: false 
        }));
      }
    } catch (err) {
      setMorphoHoldings(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: err instanceof Error ? err.message : 'Failed to fetch holdings' 
      }));
    }
  }, [address]);

  // Stable wallet state management - only clear data on actual disconnect
  useEffect(() => {
    if (stableIsConnected && stableAddress) {
      // Only fetch when actually connected with an address
      const fetchAllData = async () => {
        // Fetch all token balances from Alchemy first
        const alchemyBalances = await fetchAllTokenBalances();
        setAlchemyTokenBalances(alchemyBalances);

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
        fetchMorphoHoldings();
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
    // Don't include fetchMorphoHoldings and fetchTokenPrices in deps to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableIsConnected, stableAddress, fetchAllTokenBalances]);

  const refreshBalances = useCallback(async () => {
    const alchemyBalances = await fetchAllTokenBalances();
    setAlchemyTokenBalances(alchemyBalances);

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
    fetchMorphoHoldings();
  }, [fetchTokenPrices, fetchMorphoHoldings, fetchAllTokenBalances]);

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

  // Combine all token balances
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
    // Manually fetched tokens (as fallback if Alchemy doesn't catch them)
    ...(usdcBalance && usdcBalance > BigInt(0) && !alchemyBalancesWithPrices.find(t => t.symbol.toUpperCase() === 'USDC') ? [{
      address: TOKEN_ADDRESSES.USDC,
      symbol: 'USDC',
      decimals: usdcDecimalsValue,
      balance: usdcBalance,
      formatted: usdcFormatted.toString(),
      usdValue: usdcUsdValue,
    }] : []),
    ...(cbbtcBalance && cbbtcBalance > BigInt(0) && !alchemyBalancesWithPrices.find(t => t.symbol.toUpperCase() === 'CBBTC' || t.symbol.toUpperCase() === 'CBTC') ? [{
      address: TOKEN_ADDRESSES.cbBTC,
      symbol: 'cbBTC',
      decimals: cbbtcDecimalsValue,
      balance: cbbtcBalance,
      formatted: cbbtcFormatted.toString(),
      usdValue: cbbtcUsdValue,
    }] : []),
    ...(wethBalance && wethBalance > BigInt(0) && !alchemyBalancesWithPrices.find(t => t.symbol.toUpperCase() === 'WETH') ? [{
      address: TOKEN_ADDRESSES.WETH,
      symbol: 'WETH',
      decimals: wethDecimalsValue,
      balance: wethBalance,
      formatted: wethFormatted.toString(),
      usdValue: wethUsdValue,
    }] : []),
    // Alchemy tokens (includes cbBTC and all others)
    ...alchemyBalancesWithPrices,
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
    ethUsdValue: ethUsdValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    }),
    totalUsdValue: totalUsdValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    }),
    liquidUsdValue: liquidUsdValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    }),
    morphoUsdValue: morphoHoldings.totalValueUsd.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    }),
    tokenBalances, // Now includes all major tokens with non-zero balances
    morphoHoldings,
    loading,
    error,
    refreshBalances,
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
