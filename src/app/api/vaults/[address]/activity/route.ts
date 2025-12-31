import { NextRequest, NextResponse } from 'next/server';
import type { GraphQLResponse, GraphQLTransactionsData, GraphQLTransactionItem, Transaction } from '@/types/api';
import { DEFAULT_ASSET_PRICE, DEFAULT_ASSET_DECIMALS, STABLECOIN_SYMBOLS } from '@/lib/constants';
import { logger } from '@/lib/logger';

// Input validation helpers
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidChainId(chainId: string): boolean {
  const id = parseInt(chainId, 10);
  return !isNaN(id) && id > 0 && id <= 2147483647; // Max safe integer
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get('chainId') || '8453';
  const userAddress = searchParams.get('userAddress'); // Optional: filter by user
  
  let address: string | undefined;
  try {
    const resolvedParams = await params;
    address = resolvedParams.address;

    // Validate inputs
    if (!isValidEthereumAddress(address)) {
      return NextResponse.json(
        { 
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: 'Invalid vault address format'
        },
        { status: 400 }
      );
    }

    if (!isValidChainId(chainIdParam)) {
      return NextResponse.json(
        { 
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: 'Invalid chain ID'
        },
        { status: 400 }
      );
    }

    if (userAddress && !isValidEthereumAddress(userAddress)) {
      return NextResponse.json(
        { 
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: 'Invalid user address format'
        },
        { status: 400 }
      );
    }

    const chainId = chainIdParam;
    const escapedAddress = address.replace(/"/g, '\\"');
    const escapedUserAddress = userAddress ? userAddress.replace(/"/g, '\\"') : null;
    const whereClause = [
      `vaultAddress_in: ["${escapedAddress}"]`,
      `type_in: [MetaMorphoDeposit, MetaMorphoWithdraw]`,
      ...(escapedUserAddress ? [`userAddress_in: ["${escapedUserAddress}"]`] : [])
    ].join(', ');

    // Fetch all transactions with pagination if userAddress is provided (for interest calculation)
    // Otherwise, limit to 100 for performance
    const transactionLimit = userAddress ? 1000 : 100;
    
    const query = `
      query VaultActivity {
        transactions(
          first: ${transactionLimit}
          orderBy: Timestamp
          orderDirection: Desc
          where: { 
            ${whereClause}
          }
        ) {
          items {
            hash
            timestamp
            type
            blockNumber
            chain {
              id
              network
            }
            user {
              address
            }
            data {
              ... on VaultTransactionData {
                shares
                assets
                vault {
                  address
                }
              }
            }
          }
        }
      }
    `;

    let response: Response;
    let responseText: string;
    let data: GraphQLResponse<GraphQLTransactionsData>;
    
    try {
      response = await fetch('https://api.morpho.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
        }),
        next: { 
          revalidate: 60, // 1 minute - activity data changes frequently
        },
      });

      responseText = await response.text();
      
      try {
        data = JSON.parse(responseText) as GraphQLResponse<GraphQLTransactionsData>;
      } catch (parseError) {
        // If JSON parsing fails, return empty results instead of throwing
        logger.error(
          'Failed to parse GraphQL response',
          parseError instanceof Error ? parseError : new Error(String(parseError)),
          { address, chainId: chainIdParam, responseStatus: response.status }
        );
        return NextResponse.json({
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: 'Invalid response from Morpho API',
          cached: false,
          timestamp: Date.now(),
        });
      }

      // Handle GraphQL errors gracefully
      if (data.errors && data.errors.length > 0) {
        logger.warn(
          'GraphQL errors in activity query',
          { 
            address, 
            chainId: chainIdParam,
            errors: data.errors.map(e => e.message)
          }
        );
        return NextResponse.json({
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: data.errors[0]?.message || 'GraphQL query failed',
          cached: false,
          timestamp: Date.now(),
        });
      }

      // If HTTP response is not ok but we have valid JSON, still try to process
      if (!response.ok && !data.errors) {
        logger.warn(
          'Non-OK HTTP response from Morpho API',
          { 
            address, 
            chainId: chainIdParam,
            status: response.status,
            statusText: response.statusText
          }
        );
        return NextResponse.json({
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: `Morpho API error: ${response.status} ${response.statusText}`,
          cached: false,
          timestamp: Date.now(),
        });
      }
    } catch (fetchError) {
      // Network or fetch errors
      logger.error(
        'Failed to fetch from Morpho GraphQL API',
        fetchError instanceof Error ? fetchError : new Error(String(fetchError)),
        { address, chainId: chainIdParam }
      );
      return NextResponse.json({
        transactions: [],
        deposits: [],
        withdrawals: [],
        events: [],
        error: 'Failed to connect to Morpho API',
        cached: false,
        timestamp: Date.now(),
      });
    }

    const vaultV1Txs = data.data?.transactions?.items || [];
    let assetPrice = DEFAULT_ASSET_PRICE;
    let assetDecimals = DEFAULT_ASSET_DECIMALS;
    
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
            chainId: parseInt(chainId),
          },
        }),
      });
      
      if (vaultResponse.ok) {
        const vaultData = await vaultResponse.json();
        const vaultInfo = vaultData.data?.vaultByAddress;
          if (vaultInfo?.asset) {
          assetDecimals = vaultInfo.asset.decimals || DEFAULT_ASSET_DECIMALS;
          assetPrice = vaultInfo.asset.priceUsd || DEFAULT_ASSET_PRICE;
          
          if (!vaultInfo.asset.priceUsd) {
            const symbol = vaultInfo.asset.symbol || '';
            const symbolUpper = symbol.toUpperCase();
            if (symbol && !STABLECOIN_SYMBOLS.includes(symbolUpper as typeof STABLECOIN_SYMBOLS[number])) {
              try {
                const priceUrl = new URL('/api/prices', request.url);
                priceUrl.searchParams.set('symbols', symbol);
                const priceResponse = await fetch(priceUrl.toString());
                if (priceResponse.ok) {
                  const priceData = await priceResponse.json();
                  const priceKey = symbol.toLowerCase();
                  assetPrice = priceData[priceKey] || DEFAULT_ASSET_PRICE;
                }
              } catch (error) {
                // Log error but continue with default price
                logger.error(
                  `Failed to fetch price for ${symbol}`,
                  error instanceof Error ? error : new Error(String(error)),
                  { symbol, vaultAddress: address }
                );
              }
            }
          }
        }
      }
    } catch (error) {
      // Log error but continue with default values
      logger.error(
        'Failed to fetch vault asset info',
        error instanceof Error ? error : new Error(String(error)),
        { address, chainId }
      );
    }

    const transactions: Transaction[] = vaultV1Txs.map((tx: GraphQLTransactionItem) => {
      let assetsUsd = tx.data?.assetsUsd;
      
      if (!assetsUsd && tx.data?.assets) {
        try {
          const assetsBigInt = BigInt(tx.data.assets || '0');
          const assetsDecimal = Number(assetsBigInt) / Math.pow(10, assetDecimals);
          assetsUsd = assetsDecimal * assetPrice;
        } catch {
          assetsUsd = 0;
        }
      }
      
      return {
        id: tx.hash,
        type: tx.type === 'MetaMorphoDeposit' ? 'deposit' as const : 
              tx.type === 'MetaMorphoWithdraw' ? 'withdraw' as const : 
              'event' as const,
        timestamp: tx.timestamp,
        blockNumber: tx.blockNumber,
        transactionHash: tx.hash,
        user: tx.user?.address,
        assets: tx.data?.assets,
        shares: tx.data?.shares,
        assetsUsd: assetsUsd || 0,
      };
    })
      .filter((tx: Transaction) => tx.transactionHash)
      .sort((a: Transaction, b: Transaction) => (b.timestamp || 0) - (a.timestamp || 0));

    const deposits = transactions.filter((tx: Transaction) => tx.type === 'deposit');
    const withdrawals = transactions.filter((tx: Transaction) => tx.type === 'withdraw');
    const events = transactions.filter((tx: Transaction) => tx.type !== 'deposit' && tx.type !== 'withdraw');

    return NextResponse.json({
      transactions,
      deposits,
      withdrawals,
      events,
      cached: false,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      }
    });

  } catch (error) {
    logger.error(
      'Vault activity API error',
      error instanceof Error ? error : new Error(String(error)),
      { address: address ?? 'unknown', chainId: chainIdParam }
    );
    
    return NextResponse.json(
      { 
        transactions: [],
        deposits: [],
        withdrawals: [],
        events: [],
        error: 'Failed to fetch vault activity data'
      },
      { status: 500 }
    );
  }
}

