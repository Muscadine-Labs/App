'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './config'
import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { ApolloProvider } from '@apollo/client/react'
import { VaultDataProvider } from '../contexts/VaultDataContext'
import { NotificationProvider } from '../contexts/NotificationContext'
import { WalletProvider } from '../contexts/WalletContext'

export const client = new ApolloClient({
    link: new HttpLink({ uri: "https://api.morpho.org/graphql" }),
    cache: new InMemoryCache(),
  });

type Props = {
  children: ReactNode
  initialState?: Parameters<typeof WagmiProvider>[0]['initialState']
}

export function Providers({ children, initialState }: Props) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ApolloProvider client={client}>
    <WagmiProvider
      config={config}
      initialState={initialState} // undefined in dev is fine
    >
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <NotificationProvider>
            <VaultDataProvider>
              {children}
            </VaultDataProvider>
          </NotificationProvider>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
    </ApolloProvider>
  )
}
