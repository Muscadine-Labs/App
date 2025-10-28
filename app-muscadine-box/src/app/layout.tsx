import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppLayout } from '@/components/layout/AppLayout'
import { headers } from 'next/headers'
import { cookieToInitialState } from 'wagmi'
import { Providers } from './Providers'
import { config } from './config'
import { PriceProvider } from './PriceContext'
import { TransactionModal } from '@/components/ui'

const inter = Inter({ subsets: ['latin'] })



export const metadata: Metadata = {
  title: 'Muscadine Vault',
  description: 'Powered by Muscadine Labs',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookie = (await headers()).get('cookie')

  // Only restore cookie state in production
  const initialState = cookieToInitialState(config, cookie)
      

  return (
    <html lang="en">
      <body className={inter.className}>
          <Providers initialState={initialState}>
              <PriceProvider>
                <AppLayout>{children}</AppLayout>
                <TransactionModal />
              </PriceProvider>
          </Providers>
      </body>
    </html>
  )
}
