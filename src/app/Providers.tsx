'use client'

import "core-js/proposals/iterator-helpers"; // Polyfill for Iterator Helpers used by @morpho-org/blue-sdk-wagmi

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { OnchainKitProvider } from '@coinbase/onchainkit'
import { config } from './config'
import { base } from 'wagmi/chains'
import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { ApolloProvider } from '@apollo/client/react'
import { VaultDataProvider } from '../contexts/VaultDataContext'
import { NotificationProvider } from '../contexts/NotificationContext'
import { WalletProvider } from '../contexts/WalletContext'
import { TransactionModalProvider } from '../contexts/TransactionModalContext'
import { LearningProvider } from '../contexts/LearningContext'
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

  const apiKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY
  const projectId = process.env.NEXT_PUBLIC_BASE_PROJECT_ID

  // Log warning if credentials are missing (only in development)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    if (!apiKey) {
      logger.warn('NEXT_PUBLIC_ONCHAINKIT_API_KEY is not set. Some OnchainKit features may not work.');
    }
    if (!projectId) {
      logger.warn('NEXT_PUBLIC_BASE_PROJECT_ID is not set. Token holdings may not work.');
    }
  }

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
            <OnchainKitProvider
              apiKey={apiKey}
              projectId={projectId}
              chain={base}
              config={{
                wallet: {
                  display: 'modal',
                  supportedWallets: {
                    rabby: true,
                  }
                }
              }}
            >
              <WalletProvider>
                <NotificationProvider>
                  <TransactionModalProvider>
                    <VaultDataProvider>
                      <LearningProvider>
                        {children}
                      </LearningProvider>
                    </VaultDataProvider>
                  </TransactionModalProvider>
                </NotificationProvider>
              </WalletProvider>
            </OnchainKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </ApolloProvider>
    </ErrorBoundary>
  )
}
