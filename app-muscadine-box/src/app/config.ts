import { createStorage, cookieStorage, http, fallback } from 'wagmi'
import { base } from 'wagmi/chains'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit/react'

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID
if (!projectId) throw new Error('REOWN_PROJECT_ID is not set')

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

// App metadata
const metadata = {
  name: 'Muscadine',
  description: 'Muscadine App',
  url: 'https://muscadine.io',
  icons: ['/favicon.png'],
}

// Custom storage (Kept your existing logic)
function createHybridStorage() {
  return createStorage({
    storage: {
      async getItem(key) {
        if (typeof window !== 'undefined') {
          const localValue = localStorage.getItem(key)
          if (localValue) return localValue
        }
        return cookieStorage.getItem(key)
      },
      async setItem(key, value) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(key, value)
        }
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

// 1. Prepare the RPC URL
// Ideally, use your specific key. Fallback to demo only if necessary (demo is also rate limited)
const alchemyUrl = alchemyApiKey 
  ? `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
  : 'https://base-mainnet.g.alchemy.com/v2/demo';

export const wagmiAdapter = new WagmiAdapter({
  storage: createHybridStorage(),
  ssr: true,
  projectId,
  networks: [base], // You can just use standard 'base' here since we override transports below
  transports: {
    [base.id]: fallback([
        // 2. CRITICAL FIX: Alchemy MUST be first. 
        // The Morpho SDK needs a premium/private RPC to handle simulation gas calls.
        http(alchemyUrl),
        
        // 3. Fallbacks
        // base.org is deliberately placed last because it fails simulations often
        http('https://base.blockpi.network/v1/rpc/public'),
        http('https://1rpc.io/base'),
        http('https://mainnet.base.org'), 
    ]),
  },
  // 4. OPTIMIZATION: Enable batching. 
  // This groups multiple RPC calls into one HTTP request, reducing 429 chances.
  batch: {
    multicall: true 
  }
})

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

export const config = wagmiAdapter.wagmiConfig