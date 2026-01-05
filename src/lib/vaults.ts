export type VaultVersion = 'v1' | 'v2';

export interface VaultDefinition {
  address: string;
  name: string;
  symbol: string;
  chainId: number;
  version: VaultVersion;
}

export const VAULTS: Record<string, VaultDefinition> = {
    USDC_VAULT: {
      address: '0xf7e26Fa48A568b8b0038e104DfD8ABdf0f99074F',
      name: 'Muscadine USDC Vault',
      symbol: 'USDC',
      chainId: 8453,
      version: 'v1',
    },
    cbBTC_VAULT: {
      address: '0xAeCc8113a7bD0CFAF7000EA7A31afFD4691ff3E9',
      name: 'Muscadine cbBTC Vault',
      symbol: 'cbBTC',
      chainId: 8453,
      version: 'v1',
    },
    WETH_VAULT: {
      address: '0x21e0d366272798da3A977FEBA699FCB91959d120',
      name: 'Muscadine WETH Vault',
      symbol: 'WETH',
      chainId: 8453,
      version: 'v1',
    },
    USDC_VAULT_V2: {
      address: '0x89712980Cb434eF5aE4AB29349419eb976B0b496',
      name: 'Muscadine USDC Prime',
      symbol: 'USDC',
      chainId: 8453,
      version: 'v2',
    },
    cbBTC_VAULT_V2: {
      address: '0x99dcd0D75822BA398F13B2A8852B07c7e137EC70',
      name: 'Muscadine cbBTC Prime',
      symbol: 'cbBTC',
      chainId: 8453,
      version: 'v2',
    },
    WETH_VAULT_V2: {
      address: '0xD6DCAd2f7Da91FBb27BdA471540d9770c97a5a43',
      name: 'Muscadine WETH Prime',
      symbol: 'WETH',
      chainId: 8453,
      version: 'v2',
    },
};