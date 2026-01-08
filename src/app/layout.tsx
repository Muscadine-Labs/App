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
import { MiniAppInit } from '@/components/common/MiniAppInit'

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


const appUrl = process.env.NEXT_PUBLIC_URL || 'https://app.muscadine.io';

export const metadata: Metadata = {
  title: 'Muscadine Earn',
  description: 'Powered by Muscadine Labs',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
  other: {
    'fc:miniapp': JSON.stringify({
      version: 'next',
      imageUrl: `${appUrl}/miniapp-image.png`,
      button: {
        title: 'Launch Muscadine Earn',
        action: {
          type: 'launch_miniapp',
          name: 'Muscadine Earn',
          url: appUrl,
          splashImageUrl: `${appUrl}/miniapp-splash.png`,
          // eslint-disable-next-line no-restricted-syntax
          splashBackgroundColor: '#000000', // Base mini app requires hex color, not CSS variable
        },
      },
    }),
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
                <MiniAppInit />
                <AppLayout>{children}</AppLayout>
              </PriceProvider>
          </Providers>
          <Analytics />
      </body>
    </html>
  )
}
