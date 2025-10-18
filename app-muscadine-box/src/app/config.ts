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

// Create adapter
export const wagmiAdapter = new WagmiAdapter({
    storage: createStorage({
        storage: cookieStorage
      }),
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
})

// Export adapter’s Wagmi config for Providers
export const config = wagmiAdapter.wagmiConfig
