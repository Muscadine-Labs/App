// config.ts
import { createStorage, cookieStorage } from 'wagmi'
import { base } from 'wagmi/chains'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit/react'

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID
if (!projectId) throw new Error('REOWN_PROJECT_ID is not set')

// App metadata
const metadata = {
  name: 'Muscadine',
  description: 'Muscadine App',
  url: 'https://muscadine.box',
  icons: ['/favicon.png'],
}

// Custom storage that uses localStorage in browser and cookies for SSR
function createHybridStorage() {
  return createStorage({
    storage: {
      async getItem(key) {
        // In browser, prefer localStorage
        if (typeof window !== 'undefined') {
          const localValue = localStorage.getItem(key)
          if (localValue) return localValue
        }
        // Fallback to cookies (needed for SSR)
        return cookieStorage.getItem(key)
      },
      async setItem(key, value) {
        // Set in both localStorage and cookies
        if (typeof window !== 'undefined') {
          localStorage.setItem(key, value)
        }
        // Also set cookie for SSR with proper configuration
        cookieStorage.setItem(key, value)
      },
      async removeItem(key) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(key)
        }
        cookieStorage.removeItem(key)
      },
    },
  })
}

// Create adapter with hybrid storage
export const wagmiAdapter = new WagmiAdapter({
  storage: createHybridStorage(),
  ssr: true,
  projectId,
  networks: [base],
})

// AppKit instance
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [base],
  metadata,
  featuredWalletIds: [
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
    '18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1'
  ]   
})

// Export adapter’s Wagmi config for Providers
export const config = wagmiAdapter.wagmiConfig
