import type { Metadata } from 'next'
import { Figtree, Funnel_Display, Outfit, Tinos } from 'next/font/google'
import './globals.css'
import { AppLayout } from '@/components/layout/AppLayout'
import { headers } from 'next/headers'
import { cookieToInitialState } from 'wagmi'
import { Providers } from './Providers'
import { config } from '@/config/wagmi'
import { PriceProvider } from '@/contexts/PriceContext'
import { Analytics } from '@vercel/analytics/react'

const figtree = Figtree({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-figtree',
})

const funnelDisplay = Funnel_Display({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-funnel-display',
})

const outfit = Outfit({ 
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-outfit',
})

const tinos = Tinos({ 
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-tinos',
})



export const metadata: Metadata = {
  title: 'Muscadine Vault',
  description: 'Powered by Muscadine Labs',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
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
      <body className={`${figtree.className} ${funnelDisplay.variable} ${outfit.variable} ${tinos.variable}`}>
          <Providers initialState={initialState}>
              <PriceProvider>
                <AppLayout>{children}</AppLayout>
              </PriceProvider>
          </Providers>
          <Analytics />
      </body>
    </html>
  )
}
