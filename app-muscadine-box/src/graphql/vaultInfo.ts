import { gql } from '@apollo/client';

export const GET_VAULT_ASSET_QUERY = gql`
  query GetVaultAssets($address: String!, $chainId: Int!) {
    vaultByAddress(address: $address, chainId: $chainId) {
      address
      state {
        totalAssets
        totalAssetsUsd
        totalSupply
      }
    }
  }
`;

