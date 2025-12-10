export const VAULTS = {
    USDC_VAULT: {
      address: '0xf7e26Fa48A568b8b0038e104DfD8ABdf0f99074F' as string,
      name: 'Muscadine USDC Vault',
      symbol: 'USDC',
      chainId: 8453,
    },
    cbBTC_VAULT: {
      address: '0xAeCc8113a7bD0CFAF7000EA7A31afFD4691ff3E9' as string,
      name: 'Muscadine cbBTC Vault',
      symbol: 'cbBTC',
      chainId: 8453,
    },
    WETH_VAULT: {
      address: '0x21e0d366272798da3A977FEBA699FCB91959d120' as string,
      name: 'Muscadine WETH Vault',
      symbol: 'WETH',
      chainId: 8453,
    },
} as const;