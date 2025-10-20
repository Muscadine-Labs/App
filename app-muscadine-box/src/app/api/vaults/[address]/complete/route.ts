import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainId = searchParams.get('chainId') || '8453';
  const { address } = await params;

  try {
    const query = `
      query VaultComplete($address: String!, $chainId: Int!) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          name
          whitelisted
          
          # Asset information
          asset {
            address
            symbol
            decimals
            name
            priceUsd
            yield {
              apr
            }
          }
          
          # Metadata
          metadata {
            description
            forumLink
            image
            curators {
              image
              name
              url
            }
          }
          
          # Allocators
          allocators {
            address
          }
          
          # State data
          state {
            # Basic metrics
            totalAssets
            totalAssetsUsd
            totalSupply
            owner
            curator
            guardian
            timelock
            fee
            sharePrice
            sharePriceUsd
            
            # Yield data
            apy
            netApy
            netApyWithoutRewards
            avgApy
            avgNetApy
            
            # Allocation data
            allocation {
              market {
                uniqueKey
                loanAsset {
                  name
                  symbol
                }
                collateralAsset {
                  name
                  symbol
                }
                oracleAddress
                irmAddress
                lltv
                state {
                  rewards {
                    asset {
                      address
                      symbol
                    }
                    supplyApr
                    yearlySupplyTokens
                  }
                }
              }
              supplyCap
              supplyAssets
              supplyAssetsUsd
            }
            
            # Rewards
            rewards {
              asset {
                address
                symbol
              }
              supplyApr
              yearlySupplyTokens
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.morpho.org/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      body: JSON.stringify({
        query,
        variables: {
          address,
          chainId: parseInt(chainId),
        },
      }),
      // Use Next.js built-in caching instead of in-memory
      next: { 
        revalidate: 300, // 5 minutes
        tags: [`vault-${address}-${chainId}`]
      },
      // Enable HTTP/2 keep-alive for better performance
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return NextResponse.json({
      ...data,
      cached: false,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    });

  } catch (error) {
    console.error('Vault complete data API error:', error);

    return NextResponse.json(
      { 
        error: 'Failed to fetch complete vault data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

