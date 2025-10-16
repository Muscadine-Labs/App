import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppLayout } from '@/components/AppLayout'
import { headers } from 'next/headers'
import { cookieToInitialState } from 'wagmi'
import { Providers } from './providers'
import { config } from './config'


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
              <AppLayout>{children}</AppLayout>
          </Providers>
      </body>
    </html>
  )
}
