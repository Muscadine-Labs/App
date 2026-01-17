import { NextRequest, NextResponse } from 'next/server';
import { CACHE_DURATION_PRICES, DEFAULT_ASSET_PRICE, STABLECOIN_SYMBOLS } from '@/lib/constants';
import { logger } from '@/lib/logger';

// Token symbol to CoinGecko ID mapping
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDC': 'usd-coin',
  'USDT': 'tether',
  'DAI': 'dai',
  'WETH': 'ethereum',
  'WBTC': 'wrapped-bitcoin',
  'CBBTC': 'bitcoin', // cbBTC maps to Bitcoin price
};

// Input validation helpers
function isValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9]+$/.test(symbol) && symbol.length <= 10;
}

function sanitizeSymbols(symbolsParam: string): string[] {
  return symbolsParam
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0 && isValidSymbol(s))
    .slice(0, 20); // Limit to 20 symbols max
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols'); // e.g., "ETH,USDC,BTC"
  
  if (!symbolsParam || symbolsParam.trim().length === 0) {
    return NextResponse.json(
      { error: 'symbols parameter is required and cannot be empty' },
      { status: 400 }
    );
  }

  // Validate and sanitize input
  const symbols = sanitizeSymbols(symbolsParam);
  
  if (symbols.length === 0) {
    return NextResponse.json(
      { error: 'No valid symbols provided' },
      { status: 400 }
    );
  }

  const result: Record<string, number | null> = {};
  const symbolsToFetch: string[] = [];
  const coingeckoIds: string[] = [];

  try {

    // Check Next.js cache and prepare symbols to fetch
    for (const symbol of symbols) {
      // For stablecoins, always return 1.0
      if (STABLECOIN_SYMBOLS.includes(symbol as typeof STABLECOIN_SYMBOLS[number])) {
        result[symbol.toLowerCase()] = DEFAULT_ASSET_PRICE;
        continue;
      }

      const coingeckoId = SYMBOL_TO_COINGECKO_ID[symbol];
      
      if (!coingeckoId) {
        result[symbol.toLowerCase()] = null;
        continue;
      }

      // Add to fetch list - Next.js will handle caching via revalidate
      symbolsToFetch.push(symbol);
      if (!coingeckoIds.includes(coingeckoId)) {
        coingeckoIds.push(coingeckoId);
      }
    }

    // If all prices are cached, return immediately
    if (symbolsToFetch.length === 0) {
      return NextResponse.json({ ...result, cached: true });
    }

    // Fetch prices from CoinGecko with Next.js caching
    const idsParam = coingeckoIds.join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: {
          revalidate: Math.floor(CACHE_DURATION_PRICES / 1000), // Convert to seconds
        },
      }
    );

    if (!response.ok) {
      // Handle rate limiting (429) and other errors
      const isRateLimited = response.status === 429;
      
      // Return null for failed symbols
      for (const symbol of symbolsToFetch) {
        result[symbol.toLowerCase()] = null;
      }
      
      return NextResponse.json({
        ...result,
        cached: false,
        error: isRateLimited 
          ? 'Rate limited - please try again later' 
          : 'API failed to fetch prices',
        rateLimited: isRateLimited,
      }, {
        status: isRateLimited ? 429 : 502,
        headers: {
          'Cache-Control': 'no-cache',
        }
      });
    }

    const data = await response.json();

    // Update result with fetched prices
    for (const symbol of symbolsToFetch) {
      const coingeckoId = SYMBOL_TO_COINGECKO_ID[symbol];
      const price = data[coingeckoId]?.usd || null;
      result[symbol.toLowerCase()] = price;
    }

    return NextResponse.json({ ...result, cached: false }, {
      headers: {
        'Cache-Control': `public, s-maxage=${Math.floor(CACHE_DURATION_PRICES / 1000)}, stale-while-revalidate=${Math.floor(CACHE_DURATION_PRICES / 500)}`,
      }
    });
  } catch (error) {
    logger.error(
      'Failed to fetch prices',
      error instanceof Error ? error : new Error(String(error)),
      { symbols: symbolsToFetch.length > 0 ? symbolsToFetch : symbols }
    );

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRateLimitError = errorMessage.includes('429') || 
                             errorMessage.includes('rate limit') ||
                             errorMessage.includes('CORS');

    // Return partial results with error indication
    return NextResponse.json({
      ...result,
      cached: false,
      error: isRateLimitError 
        ? 'Rate limited - please try again later' 
        : 'Failed to fetch prices',
      rateLimited: isRateLimitError,
    }, {
      status: isRateLimitError ? 429 : 500,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });
  }
}
