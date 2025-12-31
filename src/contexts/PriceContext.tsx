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
        // Try to get cached data from localStorage first
        const cachedData = localStorage.getItem('crypto-prices');
        const cachedTimestamp = localStorage.getItem('crypto-prices-timestamp');
        const now = Date.now();
        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

        // If we have cached data that's still fresh, return it immediately
        if (cachedData && cachedTimestamp && (now - parseInt(cachedTimestamp)) < CACHE_DURATION) {
          return JSON.parse(cachedData);
        }

        // Fetch fresh data from API (now using dynamic symbols)
        const response = await fetch('/api/prices?symbols=BTC,ETH');
        if (!response.ok) {
          // If API fails but we have cached data (even stale), use it
          if (cachedData) {
            return JSON.parse(cachedData);
          }
          throw new Error('Failed to fetch prices');
        }
        
        const freshData = await response.json();
        
        // Cache the fresh data in localStorage
        localStorage.setItem('crypto-prices', JSON.stringify(freshData));
        localStorage.setItem('crypto-prices-timestamp', now.toString());
        
        return freshData;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchInterval: 5 * 60 * 1000, // 5 minutes
      retry: 3,
    });
  
    const prices = {
      btc: data?.btc || null,
      eth: data?.eth || null,
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

