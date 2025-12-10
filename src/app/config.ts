import { createConfig, createStorage, cookieStorage, http, fallback } from 'wagmi'
import { base } from 'wagmi/chains'
import { coinbaseWallet, metaMask } from 'wagmi/connectors'

// Validate required environment variables
const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

if (!alchemyApiKey) {
  throw new Error(
    'NEXT_PUBLIC_ALCHEMY_API_KEY is required but not set. ' +
    'Please set it in your environment variables.'
  );
}

const alchemyUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'Muscadine',
      preference: 'smartWalletOnly',
      version: '4',
    }),
    metaMask(),
  ],
  // REPLACEMENT: Use standard cookieStorage. 
  // This automatically handles client-side persistence (via document.cookie)
  // and server-side reading.
  storage: createStorage({
    storage: cookieStorage, 
  }),
  ssr: true,
  transports: {
    [base.id]: fallback([
        http(alchemyUrl),
    ]),
  },
  batch: {
    multicall: true 
  }
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}