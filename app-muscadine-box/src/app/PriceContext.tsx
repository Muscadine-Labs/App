// src/contexts/PriceContext.tsx
'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
interface PriceData {
  btc: number | null;
  eth: number | null;
  loading: boolean;
  error: string | null;
}

const PriceContext = createContext<PriceData>({
  btc: null,
  eth: null,
  loading: true,
  error: null
});

export function PriceProvider({ children }: { children: ReactNode }) {
    const { data, error, isLoading } = useQuery({
      queryKey: ['crypto-prices'],
      queryFn: async () => {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
        return response.json();
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchInterval: 5 * 60 * 1000, // 5 minutes
      retry: 3,
    });
  
    const prices = {
      btc: data?.bitcoin?.usd || null,
      eth: data?.ethereum?.usd || null,
      loading: isLoading,
      error: error?.message || null
    };
  
    return (
      <PriceContext.Provider value={prices}>
        {children}
      </PriceContext.Provider>
    );
  }

export const usePrices = () => useContext(PriceContext);