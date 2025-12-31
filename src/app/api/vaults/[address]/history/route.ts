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
  return ['7d', '30d', '90d', '1y'].includes(period);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get('chainId') || '8453';
  const period = searchParams.get('period') || '30d'; // 7d, 30d, 90d, 1y
  
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
          error: 'Invalid period. Must be one of: 7d, 30d, 90d, 1y'
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
    const startTime = now - (periodSeconds[period] || periodSeconds['30d']);

    // Determine interval based on period
    const intervalMap: Record<string, string> = {
      '7d': 'HOUR',
      '30d': 'DAY',
      '90d': 'DAY',
      '1y': 'DAY',
    };
    const interval = intervalMap[period] || 'DAY';

    const query = `
      query VaultHistory($address: String!, $chainId: Int!, $options: TimeseriesOptions) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          asset {
            symbol
            decimals
            priceUsd
          }
          historicalState {
            apy(options: $options) {
              x
              y
            }
            netApy(options: $options) {
              x
              y
            }
            totalAssetsUsd(options: $options) {
              x
              y
            }
            totalAssets(options: $options) {
              x
              y
            }
            sharePriceUsd(options: $options) {
              x
              y
            }
            totalSupply(options: $options) {
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
          address,
          chainId,
          options: {
            startTimestamp: startTime,
            endTimestamp: now,
            interval: interval,
          },
        },
      }),
      next: { 
        revalidate: 300, // 5 minutes - historical data changes less frequently
      },
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const data = await response.json();

    // Check if errors are about historical data not being available
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

    const vaultV1 = data.data?.vaultByAddress;
    
    if (!vaultV1 || !vaultV1.historicalState) {
      return NextResponse.json({
        history: [],
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    const apyData = vaultV1.historicalState.apy || [];
    const netApyData = vaultV1.historicalState.netApy || [];
    const totalAssetsUsdData = vaultV1.historicalState.totalAssetsUsd || [];
    const totalAssetsData = vaultV1.historicalState.totalAssets || [];
    const sharePriceUsdData = vaultV1.historicalState.sharePriceUsd || [];
    const totalSupplyData = vaultV1.historicalState.totalSupply || [];
    
    const assetDecimals = vaultV1.asset?.decimals || 18;
    const assetPriceUsd = vaultV1.asset?.priceUsd || 0;

    const timestamps = new Set<number>();
    apyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    netApyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    totalAssetsUsdData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    totalAssetsData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    sharePriceUsdData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    totalSupplyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));

    const apyMap = new Map(apyData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const netApyMap = new Map(netApyData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const totalAssetsUsdMap = new Map(totalAssetsUsdData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const totalAssetsMap = new Map(totalAssetsData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const sharePriceUsdMap = new Map(sharePriceUsdData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const totalSupplyMap = new Map(totalSupplyData.map((p: { x: number; y: number }) => [p.x, p.y]));

    const history = Array.from(timestamps)
      .sort((a, b) => a - b)
      .map((timestamp) => {
        const apy = apyMap.get(timestamp) || 0;
        const netApy = netApyMap.get(timestamp) || 0;
        const totalAssetsUsd: number = (totalAssetsUsdMap.get(timestamp) || 0) as number;
        const totalAssetsRawValue = totalAssetsMap.get(timestamp);
        
        // Convert totalAssets from raw units to decimal
        // Note: Morpho GraphQL API's historicalState.totalAssets returns values in raw units (wei/smallest unit)
        let totalAssets: number = 0;
        if (totalAssetsRawValue !== undefined && totalAssetsRawValue !== null) {
          let rawValue: number = 0;
          if (typeof totalAssetsRawValue === 'string') {
            rawValue = parseFloat(totalAssetsRawValue);
          } else if (typeof totalAssetsRawValue === 'number') {
            rawValue = totalAssetsRawValue;
          }
          
          if (rawValue > 0 && !isNaN(rawValue) && isFinite(rawValue)) {
            // Convert from raw units to decimal
            const convertedValue = rawValue / Math.pow(10, assetDecimals);
            
            // Validation: Check if conversion makes sense by comparing with USD value
            if (typeof assetPriceUsd === 'number' && assetPriceUsd > 0 && 
                typeof totalAssetsUsd === 'number' && totalAssetsUsd > 0) {
              const expectedFromUsd = totalAssetsUsd / assetPriceUsd;
              
              // Check both converted value and raw value to see which makes more sense
              let ratioConverted = 0;
              let ratioRaw = 0;
              
              if (convertedValue > 0) {
                ratioConverted = expectedFromUsd / convertedValue;
              }
              if (rawValue > 0) {
                ratioRaw = expectedFromUsd / rawValue;
              }
              
              // Use the value that's closer to 1 (more accurate)
              // If converted value ratio is way off (>100 or <0.01), try raw value
              if (convertedValue > 0 && (ratioConverted > 100 || ratioConverted < 0.01)) {
                // The raw value might already be in decimal format
                // Check if raw value makes more sense
                if (ratioRaw > 0.5 && ratioRaw < 2) {
                  totalAssets = rawValue;
                } else {
                  // Still use converted, but log that something might be off
                  totalAssets = convertedValue;
                }
              } else if (convertedValue > 0) {
                // Use converted value
                totalAssets = convertedValue;
              } else {
                // Fallback to raw value if converted is 0
                totalAssets = rawValue;
              }
            } else {
              // No validation possible, use converted value (or raw if converted is 0)
              totalAssets = convertedValue > 0 ? convertedValue : rawValue;
            }
          }
        }
        
        // Get historical sharePriceUsd from GraphQL if available
        const historicalSharePriceUsd = sharePriceUsdMap.get(timestamp);
        const historicalTotalSupplyRaw = totalSupplyMap.get(timestamp);
        
        // Calculate historical share price if not available from GraphQL
        let sharePriceUsd: number = 0;
        if (typeof historicalSharePriceUsd === 'number' && historicalSharePriceUsd > 0) {
          sharePriceUsd = historicalSharePriceUsd;
        } else if (historicalTotalSupplyRaw !== undefined && historicalTotalSupplyRaw !== null) {
          // Calculate from totalAssetsUsd / totalSupply
          const totalSupplyRaw = typeof historicalTotalSupplyRaw === 'string' 
            ? parseFloat(historicalTotalSupplyRaw)
            : (typeof historicalTotalSupplyRaw === 'number' ? historicalTotalSupplyRaw : 0);
          if (totalSupplyRaw > 0) {
            const totalSupplyDecimal = totalSupplyRaw / Math.pow(10, assetDecimals);
            if (totalSupplyDecimal > 0 && totalAssetsUsd > 0) {
              sharePriceUsd = totalAssetsUsd / totalSupplyDecimal;
            }
          }
        }
        
        // Calculate historical asset price from GraphQL data: assetPriceUsd = totalAssetsUsd / totalAssets
        let historicalAssetPriceUsd = assetPriceUsd; // Fallback to current price
        if (totalAssets > 0 && totalAssetsUsd > 0) {
          historicalAssetPriceUsd = totalAssetsUsd / totalAssets;
        }
        
        const apyValue = typeof apy === 'number' ? apy : 0;
        const netApyValue = typeof netApy === 'number' ? netApy : 0;

        return {
          timestamp,
          date: new Date(timestamp * 1000).toISOString().split('T')[0],
          totalAssetsUsd,
          totalAssets,
          sharePriceUsd: sharePriceUsd || 0, // Historical share price from GraphQL or calculated
          assetPriceUsd: historicalAssetPriceUsd, // Historical price calculated from GraphQL data
          apy: apyValue * 100,
          netApy: netApyValue * 100,
        };
      });

    return NextResponse.json({
      history,
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
      'Failed to fetch vault history',
      error instanceof Error ? error : new Error(String(error)),
      { address: address ?? 'unknown', chainId: chainIdParam, period }
    );

    return NextResponse.json(
      { 
        history: [],
        period,
        error: 'Failed to fetch vault history'
      },
      { status: 500 }
    );
  }
}

