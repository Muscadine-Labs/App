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
          error: 'Invalid period. Must be one of: 7d, 30d, 90d, 1y, all'
        },
        { status: 400 }
      );
    }

    const chainId = parseInt(chainIdParam, 10);
    
    // Calculate time range based on period
    const now = Math.floor(Date.now() / 1000);
    // For 'all', set startTime to 0 (epoch start) to fetch all available data
    const startTime = period === 'all' ? 0 : (now - (PERIOD_SECONDS[period] || PERIOD_SECONDS['30d']));

    // Determine interval based on period
    const interval = INTERVAL_MAP[period] || 'DAY';

    // V1 vaults use apy and netApy
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
            sharePrice(options: $options) {
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

    const vaultData = data.data?.vaultByAddress;
    
    if (!vaultData || !vaultData.historicalState) {
      return NextResponse.json({
        history: [],
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    const apyData = vaultData.historicalState.apy || [];
    const netApyData = vaultData.historicalState.netApy || [];
    const totalAssetsUsdData = vaultData.historicalState.totalAssetsUsd || [];
    const totalAssetsData = vaultData.historicalState.totalAssets || [];
    const sharePriceData = vaultData.historicalState.sharePrice || [];
    const sharePriceUsdData = vaultData.historicalState.sharePriceUsd || [];
    const totalSupplyData = vaultData.historicalState.totalSupply || [];
    
    const assetDecimals = vaultData.asset?.decimals || 18;
    const assetPriceUsd = vaultData.asset?.priceUsd || 0;

    const timestamps = new Set<number>();
    apyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    netApyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    totalAssetsUsdData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    totalAssetsData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    sharePriceData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    sharePriceUsdData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    totalSupplyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));

    const apyMap = new Map(apyData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const netApyMap = new Map(netApyData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const totalAssetsUsdMap = new Map(totalAssetsUsdData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const totalAssetsMap = new Map(totalAssetsData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const sharePriceMap = new Map(sharePriceData.map((p: { x: number; y: number }) => [p.x, p.y]));
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
        let totalAssets: number = 0;
        if (totalAssetsRawValue !== undefined && totalAssetsRawValue !== null) {
          let rawValue: number = 0;
          if (typeof totalAssetsRawValue === 'string') {
            rawValue = parseFloat(totalAssetsRawValue);
          } else if (typeof totalAssetsRawValue === 'number') {
            rawValue = totalAssetsRawValue;
          }
          
          if (rawValue > 0 && !isNaN(rawValue) && isFinite(rawValue)) {
            const convertedValue = rawValue / Math.pow(10, assetDecimals);
            
            if (typeof assetPriceUsd === 'number' && assetPriceUsd > 0 && 
                typeof totalAssetsUsd === 'number' && totalAssetsUsd > 0) {
              const expectedFromUsd = totalAssetsUsd / assetPriceUsd;
              
              let ratioConverted = 0;
              let ratioRaw = 0;
              
              if (convertedValue > 0) {
                ratioConverted = expectedFromUsd / convertedValue;
              }
              if (rawValue > 0) {
                ratioRaw = expectedFromUsd / rawValue;
              }
              
              if (convertedValue > 0 && (ratioConverted > 100 || ratioConverted < 0.01)) {
                if (ratioRaw > 0.5 && ratioRaw < 2) {
                  totalAssets = rawValue;
                } else {
                  totalAssets = convertedValue;
                }
              } else if (convertedValue > 0) {
                totalAssets = convertedValue;
              } else {
                totalAssets = rawValue;
              }
            } else {
              totalAssets = convertedValue > 0 ? convertedValue : rawValue;
            }
          }
        }
        
        let historicalAssetPriceUsd = assetPriceUsd;
        if (totalAssets > 0 && totalAssetsUsd > 0) {
          historicalAssetPriceUsd = totalAssetsUsd / totalAssets;
        }
        
        const historicalSharePriceRaw = sharePriceMap.get(timestamp);
        const historicalSharePriceUsd = sharePriceUsdMap.get(timestamp);
        const historicalTotalSupplyRaw = totalSupplyMap.get(timestamp);
        
        let sharePrice: number = 0;
        if (historicalSharePriceRaw !== undefined && historicalSharePriceRaw !== null) {
          const rawValue = typeof historicalSharePriceRaw === 'string' 
            ? parseFloat(historicalSharePriceRaw)
            : (typeof historicalSharePriceRaw === 'number' ? historicalSharePriceRaw : 0);
          if (rawValue > 0) {
            sharePrice = rawValue / Math.pow(10, assetDecimals);
          }
        }
        
        if (sharePrice === 0 && totalAssets > 0 && historicalTotalSupplyRaw !== undefined && historicalTotalSupplyRaw !== null) {
          const totalSupplyRaw = typeof historicalTotalSupplyRaw === 'string' 
            ? parseFloat(historicalTotalSupplyRaw)
            : (typeof historicalTotalSupplyRaw === 'number' ? historicalTotalSupplyRaw : 0);
          if (totalSupplyRaw > 0) {
            const totalSupplyDecimal = totalSupplyRaw / 1e18;
            if (totalSupplyDecimal > 0) {
              sharePrice = totalAssets / totalSupplyDecimal;
            }
          }
        }
        
        let sharePriceUsd: number = 0;
        if (typeof historicalSharePriceUsd === 'number' && historicalSharePriceUsd > 0) {
          sharePriceUsd = historicalSharePriceUsd;
        } else if (sharePrice > 0 && historicalAssetPriceUsd > 0) {
          sharePriceUsd = sharePrice * historicalAssetPriceUsd;
        } else if (historicalTotalSupplyRaw !== undefined && historicalTotalSupplyRaw !== null) {
          const totalSupplyRaw = typeof historicalTotalSupplyRaw === 'string' 
            ? parseFloat(historicalTotalSupplyRaw)
            : (typeof historicalTotalSupplyRaw === 'number' ? historicalTotalSupplyRaw : 0);
          if (totalSupplyRaw > 0) {
            const totalSupplyDecimal = totalSupplyRaw / 1e18;
            if (totalSupplyDecimal > 0 && totalAssetsUsd > 0) {
              sharePriceUsd = totalAssetsUsd / totalSupplyDecimal;
            }
          }
        }
        
        const apyValue = typeof apy === 'number' ? apy : 0;
        const netApyValue = typeof netApy === 'number' ? netApy : 0;

        return {
          timestamp,
          date: new Date(timestamp * 1000).toISOString().split('T')[0],
          totalAssetsUsd,
          totalAssets,
          sharePrice: sharePrice || 0,
          sharePriceUsd: sharePriceUsd || 0,
          assetPriceUsd: historicalAssetPriceUsd,
          apy: apyValue * 100,
          netApy: netApyValue * 100,
        };
      })
      .filter(item => item.timestamp >= MIN_VALID_TIMESTAMP);

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

