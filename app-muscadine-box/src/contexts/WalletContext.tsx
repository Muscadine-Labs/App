'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useBalance, useReadContract } from 'wagmi';

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

// USDC contract address on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// USDC ABI for balanceOf
const USDC_ABI = [
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
  const { address, isConnected } = useAppKitAccount();
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(0);
  const [usdcUsdPrice] = useState<number>(1); // USDC is pegged to $1
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

  // Get USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address }
  });

  // Fetch token prices dynamically
  const fetchTokenPrices = useCallback(async (symbols: string[]) => {
    try {
      const symbolsParam = symbols.join(',');
      const response = await fetch(`/api/prices?symbols=${symbolsParam}`);
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Failed to fetch token prices:', err);
      return {};
    }
  }, []);

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

      const data = await response.json();
      
      if (data.data?.userByAddress?.vaultPositions) {
        // Filter out positions with zero shares
        const positions = data.data.userByAddress.vaultPositions.filter(
          (pos: any) => parseFloat(pos.shares) > 0
        );
        
        const totalValueUsd = positions.reduce((sum: number, position: any) => {
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
      console.error('Failed to fetch Morpho holdings:', err);
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
      const fetchAllPrices = async () => {
        const prices = await fetchTokenPrices(['ETH', 'USDC']);
        setEthUsdPrice(prices.eth || 0);
        fetchMorphoHoldings();
      };
      
      fetchAllPrices();
    } else if (!stableIsConnected) {
      // Only clear data when explicitly disconnected (not during auth flows)
      setMorphoHoldings(prev => ({ 
        ...prev, 
        totalValueUsd: 0, 
        positions: [],
        isLoading: false 
      }));
      setEthUsdPrice(0);
    }
    // Don't include fetchMorphoHoldings and fetchTokenPrices in deps to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableIsConnected, stableAddress]);

  const refreshBalances = useCallback(async () => {
    const prices = await fetchTokenPrices(['ETH', 'USDC']);
    setEthUsdPrice(prices.eth || 0);
    fetchMorphoHoldings();
  }, [fetchTokenPrices, fetchMorphoHoldings]);

  // Calculate balances and USD values
  const ethFormatted = ethBalance ? parseFloat(ethBalance.formatted) : 0;
  const ethUsdValue = ethFormatted * ethUsdPrice;
  
  // USDC has 6 decimals
  const usdcFormatted = usdcBalance ? Number(usdcBalance) / 1e6 : 0;
  const usdcUsdValue = usdcFormatted * usdcUsdPrice;
  
  // Calculate liquid assets (ETH + USDC in wallet)
  const liquidUsdValue = ethUsdValue + usdcUsdValue;
  
  // Calculate total value (liquid + Morpho vaults)
  const totalUsdValue = liquidUsdValue + morphoHoldings.totalValueUsd;

  const tokenBalances: TokenBalance[] = [
    {
      address: 'ETH',
      symbol: 'ETH',
      decimals: 18,
      balance: ethBalance?.value || BigInt(0),
      formatted: ethBalance?.formatted || '0',
      usdValue: ethUsdValue,
    },
    {
      address: USDC_ADDRESS,
      symbol: 'USDC',
      decimals: 6,
      balance: usdcBalance || BigInt(0),
      formatted: usdcFormatted.toString(),
      usdValue: usdcUsdValue,
    },
  ];

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
    tokenBalances,
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
