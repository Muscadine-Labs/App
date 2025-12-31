'use client'

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base } from 'wagmi/chains'
import { http, fallback } from 'wagmi'
import { 
  coinbaseWallet, 
  metaMaskWallet, 
  walletConnectWallet 
} from '@rainbow-me/rainbowkit/wallets'

// Validate required environment variables
const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!alchemyApiKey) {
  throw new Error(
    'NEXT_PUBLIC_ALCHEMY_API_KEY is required but not set. ' +
    'Please set it in your environment variables.'
  );
}

if (!walletConnectProjectId) {
  throw new Error(
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required but not set. ' +
    'Get a project ID at https://cloud.walletconnect.com/'
  );
}

const alchemyUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;

// Configure wallets
const wallets = [
  {
    groupName: 'Recommended',
    wallets: [
      coinbaseWallet,
      metaMaskWallet,
      walletConnectWallet,
    ],
  },
];

export const config = getDefaultConfig({
  appName: 'Muscadine',
  projectId: walletConnectProjectId,
  chains: [base], // Base is the default and only chain
  wallets,
  transports: {
    [base.id]: fallback([
      http(alchemyUrl),
      http(), // Public RPC fallback for balance fetching
    ]),
  },
  ssr: true,
 
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}

