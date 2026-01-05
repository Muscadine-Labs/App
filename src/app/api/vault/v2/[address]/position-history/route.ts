import { NextRequest, NextResponse } from 'next/server';
import type { GraphQLError } from '@/types/api';
import { logger } from '@/lib/logger';
import { isValidEthereumAddress } from '@/lib/vault-utils';
import { isValidChainId, isValidPeriod, MIN_VALID_TIMESTAMP, PERIOD_SECONDS, INTERVAL_MAP } from '@/lib/api-utils';

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
    const now = Math.floor(Date.now() / 1000);
    const startTime = period === 'all' ? 0 : (now - (PERIOD_SECONDS[period] || PERIOD_SECONDS['30d']));
    const interval = INTERVAL_MAP[period] || 'DAY';

    // V2 vaults use vaultV2PositionByAddress with direct fields (not nested in state)
    // and history instead of historicalState
    const query = `
      query VaultV2PositionHistory($userAddress: String!, $vaultAddress: String!, $chainId: Int!, $options: TimeseriesOptions) {
        vaultV2PositionByAddress(userAddress: $userAddress, vaultAddress: $vaultAddress, chainId: $chainId) {
          shares
          assets
          assetsUsd
          history {
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
        revalidate: 300,
      },
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const data = await response.json();

    const hasNotFoundError = data.errors?.some((err: GraphQLError) => 
      err.status === 'NOT_FOUND' || err.message?.includes('No results matching')
    );
    
    if (data.errors && !hasNotFoundError) {
      logger.error(
        'GraphQL errors in position history query',
        new Error(data.errors[0]?.message || 'GraphQL query failed'),
        { address, chainId, userAddress, errors: data.errors }
      );
      return NextResponse.json({
        history: [],
        period,
        cached: false,
        timestamp: Date.now(),
        error: data.errors[0]?.message || 'GraphQL query failed',
      });
    }

    // V2 uses vaultV2PositionByAddress with direct fields
    const vaultPosition = data.data?.vaultV2PositionByAddress;
    
    if (!vaultPosition) {
      logger.warn(
        'No vault position data returned from GraphQL',
        { address, chainId, userAddress, data: data.data }
      );
      return NextResponse.json({
        history: [],
        currentPosition: null,
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    // V2 has direct fields, not nested in state
    const currentPosition = {
      assets: vaultPosition.assets || 0,
      assetsUsd: vaultPosition.assetsUsd || 0,
      shares: vaultPosition.shares || 0,
    };
    
    if (!vaultPosition.history) {
      logger.warn(
        'No historical data for vault position',
        { address, chainId, userAddress, hasPosition: !!vaultPosition }
      );
      return NextResponse.json({
        history: [],
        currentPosition,
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    // V2 uses history instead of historicalState
    const assetsData = vaultPosition.history.assets || [];
    const assetsUsdData = vaultPosition.history.assetsUsd || [];
    const sharesData = vaultPosition.history.shares || [];
    
    const assetsMap = new Map(assetsData.map((p: { x: number; y: number | string }) => [p.x, typeof p.y === 'string' ? parseFloat(p.y) : p.y]));
    const assetsUsdMap = new Map(assetsUsdData.map((p: { x: number; y: number | string }) => [p.x, typeof p.y === 'string' ? parseFloat(p.y) : p.y]));
    const sharesMap = new Map(sharesData.map((p: { x: number; y: number | string }) => [p.x, typeof p.y === 'string' ? parseFloat(p.y) : p.y]));
    
    const timestamps = new Set<number>();
    assetsData.forEach((point: { x: number }) => timestamps.add(point.x));
    assetsUsdData.forEach((point: { x: number }) => timestamps.add(point.x));
    sharesData.forEach((point: { x: number }) => timestamps.add(point.x));
    
    let assetDecimals = 18;
    try {
      const vaultQuery = `
        query VaultAssetInfo($address: String!, $chainId: Int!) {
          vaultV2ByAddress(address: $address, chainId: $chainId) {
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
        const vaultInfo = vaultData.data?.vaultV2ByAddress;
        if (vaultInfo?.asset) {
          assetDecimals = vaultInfo.asset.decimals || 18;
        }
      }
    } catch (error) {
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
        
        const assetsDecimal = assetsRaw / Math.pow(10, assetDecimals);
        const sharesDecimal = sharesRaw / 1e18;
        
        return {
          timestamp,
          date: new Date(timestamp * 1000).toISOString().split('T')[0],
          assets: assetsDecimal,
          assetsUsd,
          shares: sharesDecimal,
        };
      })
      .filter(item => item.timestamp >= MIN_VALID_TIMESTAMP);

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

