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

interface WalletContextType {
  ethBalance: string;
  ethUsdValue: string;
  totalUsdValue: string;
  liquidUsdValue: string;
  morphoUsdValue: string;
  tokenBalances: TokenBalance[];
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
  const [morphoVaultValue, setMorphoVaultValue] = useState<number>(0);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

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
      setMorphoVaultValue(0);
      return;
    }

    try {
      // This is a placeholder - we'll need to implement actual vault balance fetching
      // For now, we'll fetch the user's vault share balances from the Morpho API
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
                    state {
                      sharePriceUsd
                    }
                  }
                  shares
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
        const totalValue = data.data.userByAddress.vaultPositions.reduce(
          (sum: number, position: { shares: string; vault: { state?: { sharePriceUsd?: number } } }) => {
            const shares = Number(position.shares) / 1e18; // Assuming 18 decimals
            const sharePriceUsd = position.vault.state?.sharePriceUsd || 0;
            return sum + (shares * sharePriceUsd);
          },
          0
        );
        setMorphoVaultValue(totalValue);
      } else {
        setMorphoVaultValue(0);
      }
    } catch (err) {
      console.error('Failed to fetch Morpho holdings:', err);
      setMorphoVaultValue(0);
    }
  }, [address]);

  useEffect(() => {
    const fetchAllPrices = async () => {
      if (isConnected) {
        const prices = await fetchTokenPrices(['ETH', 'USDC']);
        setEthUsdPrice(prices.eth || 0);
        fetchMorphoHoldings();
      } else {
        setMorphoVaultValue(0);
        setEthUsdPrice(0);
      }
    };
    
    fetchAllPrices();
  }, [isConnected, fetchTokenPrices, fetchMorphoHoldings]);

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
  const totalUsdValue = liquidUsdValue + morphoVaultValue;

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
    morphoUsdValue: morphoVaultValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    }),
    tokenBalances,
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
