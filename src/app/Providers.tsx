'use client'

import "core-js/proposals/iterator-helpers"; // Polyfill for Iterator Helpers used by @morpho-org/blue-sdk-wagmi

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { config } from './config'
import { base } from 'wagmi/chains'
import '@rainbow-me/rainbowkit/styles.css'
import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { ApolloProvider } from '@apollo/client/react'
import { VaultDataProvider } from '../contexts/VaultDataContext'
import { WalletProvider } from '../contexts/WalletContext'
import { TransactionProvider } from '../contexts/TransactionContext'
import { TransactionModalProvider } from '../contexts/TransactionModalContext'
import { ToastProvider } from '../contexts/ToastContext'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { logger } from '../lib/logger'

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
    <ErrorBoundary
      onError={(error, errorInfo) => {
        logger.error('Providers error boundary caught error', error, {
          componentStack: errorInfo.componentStack,
        });
      }}
    >
      <ApolloProvider client={client}>
        <WagmiProvider
          config={config}
          initialState={initialState} // undefined in dev is fine
          reconnectOnMount={true} // Automatically reconnect on mount (page reload) - defaults to true but explicit for clarity
        >
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider
              initialChain={base}
              theme={darkTheme({
                accentColor: 'var(--primary)',
                accentColorForeground: 'white',
                borderRadius: 'medium',
                fontStack: 'system',
                overlayBlur: 'small',
              })}
            >
              <ToastProvider>
                <WalletProvider>
                  <TransactionModalProvider>
                    <VaultDataProvider>
                      <TransactionProvider>
                        {children}
                      </TransactionProvider>
                    </VaultDataProvider>
                  </TransactionModalProvider>
                </WalletProvider>
              </ToastProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </ApolloProvider>
    </ErrorBoundary>
  )
}
