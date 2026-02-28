import { NextRequest, NextResponse } from 'next/server';
import type { GraphQLResponse, GraphQLTransactionsData, GraphQLV2TransactionItem, Transaction } from '@/types/api';
import { DEFAULT_ASSET_PRICE, DEFAULT_ASSET_DECIMALS, STABLECOIN_SYMBOLS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { isValidEthereumAddress } from '@/lib/vault-utils';
import { isValidChainId } from '@/lib/api-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get('chainId') || '8453';
  const userAddress = searchParams.get('userAddress');
  
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

    const chainId = parseInt(chainIdParam, 10);
    const transactionLimit = userAddress ? 1000 : 100;

    // Use GraphQL variables to safely pass user input (prevents injection)
    // V2 vaults use vaultV2transactions query per Morpho API docs
    // https://docs.morpho.org/tools/offchain/api/morpho-vaults/
    const query = `
      query VaultV2Activity($vaultAddress: String!, $userAddressIn: [String!], $first: Int!) {
        vaultV2transactions(
          first: $first
          skip: 0
          orderBy: Time
          orderDirection: Desc
          where: { 
            vaultAddress_in: [$vaultAddress]
            userAddress_in: $userAddressIn
          }
        ) {
          items {
            txHash
            timestamp
            type
            blockNumber
            txIndex
            vault {
              address
            }
            shares
            data {
              ... on VaultV2DepositData {
                assets
                sender
                onBehalf
              }
              ... on VaultV2WithdrawData {
                assets
                sender
                onBehalf
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
          variables: {
            vaultAddress: address,
            userAddressIn: userAddress ? [userAddress] : null,
            first: transactionLimit,
          },
        }),
        next: { 
          revalidate: 60,
        },
      });

      responseText = await response.text();
      
      try {
        data = JSON.parse(responseText) as GraphQLResponse<GraphQLTransactionsData>;
      } catch (parseError) {
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

      if (data.errors && data.errors.length > 0) {
        logger.warn(
          'GraphQL errors in V2 activity query',
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

    // V2 uses vaultV2transactions which already filters by vault address
    const vaultTxs = data.data?.vaultV2transactions?.items || [];
    let assetPrice = DEFAULT_ASSET_PRICE;
    let assetDecimals = DEFAULT_ASSET_DECIMALS;
    
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
      logger.error(
        'Failed to fetch vault asset info',
        error instanceof Error ? error : new Error(String(error)),
        { address, chainId }
      );
    }

    const transactions: Transaction[] = vaultTxs.map((tx: GraphQLV2TransactionItem) => {
      // V2 transactions have direct fields: shares, and data.assets
      // Use data.assets if available, otherwise calculate from shares
      let assetsRaw: string | undefined;
      if (tx.data?.assets !== undefined && tx.data.assets !== null) {
        // assets is a number in V2, convert to string
        assetsRaw = tx.data.assets.toString();
      }
      
      let assetsUsd = 0;
      if (assetsRaw) {
        try {
          const assetsBigInt = BigInt(assetsRaw);
          const assetsDecimal = Number(assetsBigInt) / Math.pow(10, assetDecimals);
          assetsUsd = assetsDecimal * assetPrice;
        } catch {
          assetsUsd = 0;
        }
      }
      
      // V2 uses "Deposit" and "Withdraw" types (not MetaMorphoDeposit/MetaMorphoWithdraw)
      const transactionType = tx.type === 'Deposit' ? 'deposit' as const : 
                              tx.type === 'Withdraw' ? 'withdraw' as const : 
                              'event' as const;
      
      // User address comes from data.sender or data.onBehalf
      const userAddr = tx.data?.sender || tx.data?.onBehalf;
      
      return {
        id: tx.txHash,
        type: transactionType,
        timestamp: tx.timestamp,
        blockNumber: tx.blockNumber,
        transactionHash: tx.txHash,
        user: userAddr,
        assets: assetsRaw,
        shares: tx.shares,
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
      assetPriceUsd: assetPrice,
      assetDecimals,
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
