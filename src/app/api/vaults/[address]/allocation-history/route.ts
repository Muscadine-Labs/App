import { NextRequest, NextResponse } from 'next/server';
import type { Allocation } from '@/types/api';
import { logger } from '@/lib/logger';

// Input validation helpers
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

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
  const period = searchParams.get('period') || '90d'; // 7d, 30d, 90d, 1y
  
  let address: string | undefined;
  try {
    const resolvedParams = await params;
    address = resolvedParams.address;

    // Validate inputs
    if (!isValidEthereumAddress(address)) {
      return NextResponse.json(
        { 
          allocationHistory: [],
          period,
          error: 'Invalid vault address format'
        },
        { status: 400 }
      );
    }

    if (!isValidChainId(chainIdParam)) {
      return NextResponse.json(
        { 
          allocationHistory: [],
          period,
          error: 'Invalid chain ID'
        },
        { status: 400 }
      );
    }

    if (!isValidPeriod(period)) {
      return NextResponse.json(
        { 
          allocationHistory: [],
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
    const startTime = now - (periodSeconds[period] || periodSeconds['90d']);

    // Determine interval based on period
    const intervalMap: Record<string, string> = {
      '7d': 'HOUR',
      '30d': 'DAY',
      '90d': 'DAY',
      '1y': 'DAY',
    };
    const interval = intervalMap[period] || 'DAY';

    // First, get current vault data to know which markets it's allocated to
    const vaultQuery = `
      query VaultAllocation($address: String!, $chainId: Int!, $options: TimeseriesOptions) {
        vaultByAddress(address: $address, chainId: $chainId) {
          state {
            allocation {
              market {
                uniqueKey
                loanAsset {
                  symbol
                }
                collateralAsset {
                  symbol
                }
              }
              supplyAssetsUsd
            }
            totalAssetsUsd
          }
          historicalState {
            totalAssetsUsd(options: $options) {
              x
              y
            }
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
            options: {
            startTimestamp: startTime,
            endTimestamp: now,
            interval: interval,
          },
        },
      }),
    });

    if (!vaultResponse.ok) {
      throw new Error(`Morpho API error: ${vaultResponse.status}`);
    }

    const vaultData = await vaultResponse.json();

    // Check for GraphQL errors but don't throw - return empty data instead
    if (vaultData.errors) {
      return NextResponse.json({
        allocationHistory: [],
        period,
        cached: false,
        timestamp: Date.now(),
        error: vaultData.errors[0]?.message || 'GraphQL query failed',
      });
    }

    const vault = vaultData.data?.vaultByAddress;
    if (!vault) {
      return NextResponse.json({
        allocationHistory: [],
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }

    if (!vault.state?.allocation || vault.state.allocation.length === 0) {
      return NextResponse.json({
        allocationHistory: [],
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }

    const allocations = vault.state.allocation || [];
    const totalAssetsUsdHistory = vault.historicalState?.totalAssetsUsd || [];
    
    if (!totalAssetsUsdHistory || totalAssetsUsdHistory.length === 0) {
      return NextResponse.json({
        allocationHistory: [],
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    // Get current allocation percentages to use as baseline
    const currentTotalAssets = vault.state.totalAssetsUsd || 0;
    // Store values first, then calculate percentages to ensure accuracy
    // Use uniqueKey to differentiate between markets with same loan/collateral pair
    const allocationValues = new Map<string, { value: number; marketName: string; uniqueKey: string }>();
    
    allocations.forEach((alloc: Allocation) => {
      if (!alloc.market?.uniqueKey) return;
      const uniqueKey = alloc.market.uniqueKey;
      const loanSymbol = alloc.market.loanAsset?.symbol || '';
      const collateralSymbol = alloc.market.collateralAsset?.symbol || '';
      const marketName = `${loanSymbol}/${collateralSymbol}`;
      const currentValue = parseFloat(alloc.supplyAssetsUsd || '0') || 0;
      
      if (currentValue > 0 && marketName !== '/') {
        // Use uniqueKey as the key to differentiate markets with same loan/collateral pair
        // If same uniqueKey appears multiple times (shouldn't happen), sum the values
        if (allocationValues.has(uniqueKey)) {
          const existing = allocationValues.get(uniqueKey)!;
          allocationValues.set(uniqueKey, {
            value: existing.value + currentValue,
            marketName: existing.marketName, // Keep original market name
            uniqueKey,
          });
        } else {
          allocationValues.set(uniqueKey, { value: currentValue, marketName, uniqueKey });
        }
      }
    });

    // Now calculate percentages from the summed values
    // Create a map keyed by uniqueKey but with display-friendly market names
    const currentAllocations = new Map<string, { percentage: number; marketName: string; value: number; uniqueKey: string }>();
    allocationValues.forEach(({ value, marketName, uniqueKey }) => {
      const percentage = currentTotalAssets > 0 ? (value / currentTotalAssets) * 100 : 0;
      // Use uniqueKey as the key to ensure each market is tracked separately
      currentAllocations.set(uniqueKey, { percentage, marketName, value, uniqueKey });
    });

    if (currentAllocations.size === 0) {
      return NextResponse.json({
        allocationHistory: [],
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }

    // Note: Morpho API does not expose historical vault allocation data per market.
    // Market historicalState.supplyAssetsUsd represents total market supply, not vault-specific allocation.
    // We use current allocation percentages applied to historical total assets as an approximation.
    
    const totalAssetsMap = new Map<number, number>(
      totalAssetsUsdHistory.map((p: { x: number; y: number }) => [p.x, parseFloat(String(p.y)) || 0])
    );
    const timestamps = Array.from(totalAssetsMap.keys()).sort((a, b) => a - b);
    
    const allocationHistory = timestamps.map((timestamp) => {
      const totalAssets = totalAssetsMap.get(timestamp) || 0;
      const allocations: Record<string, { value: number; percentage: number; marketName: string }> = {};
      
      currentAllocations.forEach(({ percentage, marketName, uniqueKey }) => {
        const value = totalAssets * (percentage / 100);
        allocations[uniqueKey] = {
          value,
          percentage,
          marketName,
        };
      });

      return {
        timestamp,
        date: new Date(timestamp * 1000).toISOString().split('T')[0],
        totalAssetsUsd: totalAssets,
        allocations,
      };
    });


    return NextResponse.json({
      allocationHistory,
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
      'Failed to fetch allocation history',
      error instanceof Error ? error : new Error(String(error)),
      { address: address ?? 'unknown', chainId: chainIdParam, period }
    );

    return NextResponse.json(
      { 
        allocationHistory: [],
        period,
        error: 'Failed to fetch allocation history'
      },
      { status: 500 }
    );
  }
}

