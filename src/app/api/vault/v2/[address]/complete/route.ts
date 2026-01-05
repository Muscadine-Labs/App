import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Input validation helpers
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidChainId(chainId: string): boolean {
  const id = parseInt(chainId, 10);
  return !isNaN(id) && id > 0 && id <= 2147483647;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get('chainId') || '8453';
  
  let address: string | undefined;
  try {
    const resolvedParams = await params;
    address = resolvedParams.address;

    // Validate inputs
    if (!isValidEthereumAddress(address)) {
      return NextResponse.json(
        { error: 'Invalid vault address format' },
        { status: 400 }
      );
    }

    if (!isValidChainId(chainIdParam)) {
      return NextResponse.json(
        { error: 'Invalid chain ID' },
        { status: 400 }
      );
    }

    const chainId = parseInt(chainIdParam, 10);
    
    // V2 vaults use vaultV2ByAddress and have a flatter structure
    const query = `
      query VaultComplete($address: String!, $chainId: Int!) {
        vaultV2ByAddress(address: $address, chainId: $chainId) {
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
          }
          
          # Metadata (V2 metadata doesn't have curators)
          metadata {
            description
            forumLink
            image
          }
          
          # Allocators (V2 uses allocator { address } structure)
          allocators {
            allocator {
              address
            }
          }
          
          # Basic metrics (v2 has these at top level)
          totalAssets
          totalAssetsUsd
          totalSupply
          avgApy
          avgNetApy
          maxApy
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
          chainId,
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

    // For v2 vaults, normalize response structure to match v1 format for compatibility
    if (data.data?.vaultV2ByAddress) {
      const vault = data.data.vaultV2ByAddress;
      const totalAssets = vault.totalAssets || '0';
      const totalSupply = vault.totalSupply || '0';
      const totalAssetsUsd = vault.totalAssetsUsd || 0;
      
      // Calculate sharePrice in tokens: totalAssets / totalSupply
      // Both are in raw units, so we need to account for decimals
      let sharePrice = 0;
      let sharePriceUsd = 0;
      
      if (totalSupply && totalSupply !== '0' && totalAssets && totalAssets !== '0') {
        const assetDecimals = vault.asset?.decimals || 18;
        const totalAssetsNum = BigInt(totalAssets);
        const totalSupplyNum = BigInt(totalSupply);
        
        // Convert to decimal for calculation
        const totalAssetsDecimal = Number(totalAssetsNum) / Math.pow(10, assetDecimals);
        const totalSupplyDecimal = Number(totalSupplyNum) / 1e18; // Shares are always 18 decimals
        
        if (totalSupplyDecimal > 0) {
          sharePrice = totalAssetsDecimal / totalSupplyDecimal;
          sharePriceUsd = totalAssetsUsd > 0 && totalSupplyDecimal > 0 
            ? totalAssetsUsd / totalSupplyDecimal 
            : 0;
        }
      }
      
      // Normalize allocators structure from V2 format to V1 format for compatibility
      const normalizedAllocators = vault.allocators?.map((alloc: { allocator: { address: string } }) => ({
        address: alloc.allocator?.address || '',
      })) || [];
      
      // Wrap v2 response in state structure for compatibility with existing code
      // Map V2 APY fields to V1 format: avgApy -> apy, avgNetApy -> netApy
      data.data.vaultByAddress = {
        ...vault,
        allocators: normalizedAllocators,
        state: {
          totalAssets: vault.totalAssets,
          totalAssetsUsd: vault.totalAssetsUsd,
          totalSupply: vault.totalSupply,
          sharePrice: sharePrice,
          sharePriceUsd: sharePriceUsd,
          apy: vault.avgApy || vault.maxApy || 0,
          netApy: vault.avgNetApy || 0,
          netApyWithoutRewards: vault.avgNetApy || 0, // V2 doesn't have this field, use avgNetApy as fallback
          avgApy: vault.avgApy || 0,
          avgNetApy: vault.avgNetApy || 0,
          maxApy: vault.maxApy || 0,
          owner: vault.owner || '',
          curator: vault.curator || '',
          guardian: vault.guardian || '',
          timelock: vault.timelock || 0,
          fee: vault.fee || 0,
          allocation: vault.allocation || [],
          rewards: vault.rewards || [],
        },
      };
      
      // Also keep vaultV2ByAddress for reference
      data.data.vaultV2ByAddress = vault;
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
    logger.error(
      'Failed to fetch complete vault data',
      error instanceof Error ? error : new Error(String(error)),
      { address: address ?? 'unknown', chainId: chainIdParam }
    );

    return NextResponse.json(
      { 
        error: 'Failed to fetch complete vault data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

