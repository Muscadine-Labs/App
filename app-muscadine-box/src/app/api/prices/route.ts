import { NextRequest, NextResponse } from 'next/server';

// Token symbol to CoinGecko ID mapping
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDC': 'usd-coin',
  'USDT': 'tether',
  'DAI': 'dai',
  'WETH': 'ethereum',
  'WBTC': 'wrapped-bitcoin',
};

// In-memory cache for prices
const cachedPrices: Record<string, { price: number | null; lastUpdated: number }> = {};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols'); // e.g., "ETH,USDC,BTC"
  
  if (!symbolsParam) {
    return NextResponse.json(
      { error: 'symbols parameter is required' },
      { status: 400 }
    );
  }

  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase());
  const now = Date.now();
  const result: Record<string, number | null> = {};
  const symbolsToFetch: string[] = [];
  const coingeckoIds: string[] = [];

  // Check cache and prepare symbols to fetch
  for (const symbol of symbols) {
    const coingeckoId = SYMBOL_TO_COINGECKO_ID[symbol];
    
    if (!coingeckoId) {
      result[symbol.toLowerCase()] = null;
      continue;
    }

    const cached = cachedPrices[coingeckoId];
    if (cached && cached.lastUpdated && (now - cached.lastUpdated) < CACHE_DURATION) {
      result[symbol.toLowerCase()] = cached.price;
    } else {
      symbolsToFetch.push(symbol);
      if (!coingeckoIds.includes(coingeckoId)) {
        coingeckoIds.push(coingeckoId);
      }
    }
  }

  // If all prices are cached, return immediately
  if (symbolsToFetch.length === 0) {
    return NextResponse.json({ ...result, cached: true });
  }

  // Fetch prices from CoinGecko
  try {
    const idsParam = coingeckoIds.join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      // If API fails but we have cached data, return it
      for (const symbol of symbolsToFetch) {
        const coingeckoId = SYMBOL_TO_COINGECKO_ID[symbol];
        const cached = cachedPrices[coingeckoId];
        if (cached && cached.price !== null) {
          result[symbol.toLowerCase()] = cached.price;
        } else {
          result[symbol.toLowerCase()] = null;
        }
      }
      
      return NextResponse.json({
        ...result,
        cached: true,
        error: 'API failed, using cached data',
      });
    }

    const data = await response.json();

    // Update cache and result
    for (const symbol of symbolsToFetch) {
      const coingeckoId = SYMBOL_TO_COINGECKO_ID[symbol];
      const price = data[coingeckoId]?.usd || null;
      
      cachedPrices[coingeckoId] = {
        price,
        lastUpdated: now,
      };
      
      result[symbol.toLowerCase()] = price;
    }

    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    console.error('Price API error:', error);

    // Return cached data if available
    for (const symbol of symbolsToFetch) {
      const coingeckoId = SYMBOL_TO_COINGECKO_ID[symbol];
      const cached = cachedPrices[coingeckoId];
      if (cached && cached.price !== null) {
        result[symbol.toLowerCase()] = cached.price;
      } else {
        result[symbol.toLowerCase()] = null;
      }
    }

    return NextResponse.json({
      ...result,
      cached: true,
      error: 'API failed, using stale cached data',
    });
  }
}
