import { NextRequest, NextResponse } from 'next/server';
import type { GraphQLError } from '@/types/api';
import { logger } from '@/lib/logger';
import { isValidEthereumAddress } from '@/lib/vault-utils';

// Input validation helpers
function isValidChainId(chainId: string): boolean {
  const id = parseInt(chainId, 10);
  return !isNaN(id) && id > 0 && id <= 2147483647;
}

function isValidPeriod(period: string): boolean {
  return ['7d', '30d', '90d', '1y', 'all'].includes(period);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get('chainId') || '8453';
  const period = searchParams.get('period') || '30d';
  const userAddress = searchParams.get('userAddress');
  
  let address: string | undefined;
  try {
    const resolvedParams = await params;
    address = resolvedParams.address;

    // Validate inputs
    if (!isValidEthereumAddress(address)) {
      return NextResponse.json(
        { 
          history: [],
          period,
          error: 'Invalid vault address format'
        },
        { status: 400 }
      );
    }

    if (!userAddress || !isValidEthereumAddress(userAddress)) {
      return NextResponse.json(
        { 
          history: [],
          period,
          error: 'Invalid or missing user address'
        },
        { status: 400 }
      );
    }

    if (!isValidChainId(chainIdParam)) {
      return NextResponse.json(
        { 
          history: [],
          period,
          error: 'Invalid chain ID'
        },
        { status: 400 }
      );
    }

    if (!isValidPeriod(period)) {
      return NextResponse.json(
        { 
          history: [],
          period,
          error: 'Invalid period. Must be one of: 7d, 30d, 90d, 1y, all'
        },
        { status: 400 }
      );
    }

    const chainId = parseInt(chainIdParam, 10);
    // Calculate time range based on period
    const now = Math.floor(Date.now() / 1000);
    const periodSeconds: Record<string, number> = {
      '7d': 7 * 24 * 60 * 60,
      '30d': 30 * 24 * 60 * 60,
      '90d': 90 * 24 * 60 * 60,
      '1y': 365 * 24 * 60 * 60,
    };
    // For 'all', set startTime to 0 (epoch start) to fetch all available data
    const startTime = period === 'all' ? 0 : (now - (periodSeconds[period] || periodSeconds['30d']));

    // Determine interval based on period
    const intervalMap: Record<string, string> = {
      '7d': 'HOUR',
      '30d': 'HOUR', // Use hourly for 30d to get better granularity
      '90d': 'DAY',
      '1y': 'DAY',
      'all': 'DAY',
    };
    const interval = intervalMap[period] || 'DAY';

    // Query user position history directly from GraphQL
    const query = `
      query VaultPositionHistory($userAddress: String!, $vaultAddress: String!, $chainId: Int!, $options: TimeseriesOptions) {
        vaultPosition(userAddress: $userAddress, vaultAddress: $vaultAddress, chainId: $chainId) {
          state {
            assets
            assetsUsd
            shares
          }
          historicalState {
            assets(options: $options) {
              x
              y
            }
            assetsUsd(options: $options) {
              x
              y
            }
            shares(options: $options) {
              x
              y
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
      },
      body: JSON.stringify({
        query,
        variables: {
          userAddress,
          vaultAddress: address,
          chainId,
          options: {
            startTimestamp: startTime,
            endTimestamp: now,
            interval: interval,
          },
        },
      }),
      next: { 
        revalidate: 300, // 5 minutes
      },
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const data = await response.json();

    // Check if errors are about position not being available
    const hasNotFoundError = data.errors?.some((err: GraphQLError) => 
      err.status === 'NOT_FOUND' || err.message?.includes('No results matching')
    );
    
    if (data.errors && !hasNotFoundError) {
      return NextResponse.json({
        history: [],
        period,
        cached: false,
        timestamp: Date.now(),
        error: data.errors[0]?.message || 'GraphQL query failed',
      });
    }

    const vaultPosition = data.data?.vaultPosition;
    
    if (!vaultPosition) {
      return NextResponse.json({
        history: [],
        currentPosition: null,
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    // Extract current position from state (if available)
    const currentPosition = vaultPosition.state ? {
      assets: vaultPosition.state.assets || 0,
      assetsUsd: vaultPosition.state.assetsUsd || 0,
      shares: vaultPosition.state.shares || 0,
    } : null;
    
    if (!vaultPosition.historicalState) {
      return NextResponse.json({
        history: [],
        currentPosition,
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    const assetsData = vaultPosition.historicalState.assets || [];
    const assetsUsdData = vaultPosition.historicalState.assetsUsd || [];
    const sharesData = vaultPosition.historicalState.shares || [];
    
    // Create maps for quick lookup
    const assetsMap = new Map(assetsData.map((p: { x: number; y: number | string }) => [p.x, typeof p.y === 'string' ? parseFloat(p.y) : p.y]));
    const assetsUsdMap = new Map(assetsUsdData.map((p: { x: number; y: number | string }) => [p.x, typeof p.y === 'string' ? parseFloat(p.y) : p.y]));
    const sharesMap = new Map(sharesData.map((p: { x: number; y: number | string }) => [p.x, typeof p.y === 'string' ? parseFloat(p.y) : p.y]));
    
    // Get all unique timestamps
    const timestamps = new Set<number>();
    assetsData.forEach((point: { x: number }) => timestamps.add(point.x));
    assetsUsdData.forEach((point: { x: number }) => timestamps.add(point.x));
    sharesData.forEach((point: { x: number }) => timestamps.add(point.x));
    
    // Get vault asset info to convert raw assets to decimal
    let assetDecimals = 18;
    try {
      const vaultQuery = `
        query VaultAssetInfo($address: String!, $chainId: Int!) {
          vaultByAddress(address: $address, chainId: $chainId) {
            asset {
              symbol
              decimals
              priceUsd
            }
          }
        }
      `;
      
      const vaultResponse = await fetch('https://api.morpho.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: vaultQuery,
          variables: {
            address,
            chainId,
          },
        }),
      });
      
      if (vaultResponse.ok) {
        const vaultData = await vaultResponse.json();
        const vaultInfo = vaultData.data?.vaultByAddress;
        if (vaultInfo?.asset) {
          assetDecimals = vaultInfo.asset.decimals || 18;
        }
      }
    } catch (error) {
      // Log but continue with default decimals
      logger.error(
        'Failed to fetch vault asset info',
        error instanceof Error ? error : new Error(String(error)),
        { address, chainId }
      );
    }

    const history = Array.from(timestamps)
      .sort((a, b) => a - b)
      .map((timestamp) => {
        const assetsRaw = (assetsMap.get(timestamp) ?? 0) as number;
        const assetsUsd = (assetsUsdMap.get(timestamp) ?? 0) as number;
        const sharesRaw = (sharesMap.get(timestamp) ?? 0) as number;
        
        // Convert raw assets to decimal (assets are in raw units, convert using asset decimals)
        const assetsDecimal = assetsRaw / Math.pow(10, assetDecimals);
        
        // Convert shares from wei (shares are always 18 decimals)
        const sharesDecimal = sharesRaw / 1e18;
        
        return {
          timestamp,
          date: new Date(timestamp * 1000).toISOString().split('T')[0],
          assets: assetsDecimal, // Token amount in decimal
          assetsUsd, // USD value
          shares: sharesDecimal, // Shares in decimal
        };
      })
      .filter(item => item.timestamp >= 1759795200); // Filter out data before October 7, 2025 00:00:00 UTC

    return NextResponse.json({
      history,
      currentPosition,
      period,
      cached: false,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    });

  } catch (error) {
    logger.error(
      'Failed to fetch vault position history',
      error instanceof Error ? error : new Error(String(error)),
      { address: address ?? 'unknown', chainId: chainIdParam, period, userAddress }
    );

    return NextResponse.json(
      { 
        history: [],
        period,
        error: 'Failed to fetch vault position history'
      },
      { status: 500 }
    );
  }
}

