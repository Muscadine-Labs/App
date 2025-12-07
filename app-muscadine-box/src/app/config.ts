import { createConfig, createStorage, cookieStorage, http, fallback } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet, metaMask } from 'wagmi/connectors'

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

// Custom storage that prioritizes cookies for SSR compatibility
// In production (Vercel), cookies are the primary source of truth
function createHybridStorage() {
  return createStorage({
    storage: {
      async getItem(key) {
        // Always try cookies first for SSR compatibility
        const cookieValue = await cookieStorage.getItem(key)
        if (cookieValue) return cookieValue
        
        // Fallback to localStorage only on client side
        if (typeof window !== 'undefined') {
          return localStorage.getItem(key)
        }
        return null
      },
      async setItem(key, value) {
        // Always set cookie first (required for SSR/production)
        await cookieStorage.setItem(key, value)
        
        // Also set in localStorage on client side for faster access
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(key, value)
          } catch {
            // localStorage might fail (private browsing, quota exceeded, etc.)
            // Cookie is already set, so we can continue
          }
        }
      },
      async removeItem(key) {
        // Remove from both storage mechanisms
        await cookieStorage.removeItem(key)
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(key)
          } catch {
            // Ignore localStorage errors
          }
        }
      },
    },
  })
}

// 1. Prepare the RPC URL
// Ideally, use your specific key. Fallback to demo only if necessary (demo is also rate limited)
const alchemyUrl = alchemyApiKey 
  ? `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
  : 'https://base-mainnet.g.alchemy.com/v2/demo';

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'Muscadine',
      preference: 'smartWalletOnly',
      version: '4',
    }),
    metaMask(),
    // Note: WalletConnect is handled by OnchainKit, so we don't add it here to avoid duplicate initialization
  ],
  storage: createHybridStorage(),
  ssr: true,
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

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}