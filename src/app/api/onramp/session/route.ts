import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Generate a Coinbase Onramp session token
 * This endpoint creates a secure session token for Coinbase Onramp using the new API format
 * with addresses and assets instead of deprecated destinationWallets
 */
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    // Validate address
    if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return NextResponse.json(
        { error: 'Valid Ethereum address is required' },
        { status: 400 }
      );
    }

    // Get API key from environment (should be server-side only)
    // CDP_API_KEY_SECRET should be your secret API key (not the public one)
    // For production, you may need to generate a JWT token first
    // See: https://docs.cdp.coinbase.com/get-started/authentication/jwt-authentication
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    const apiKeyName = process.env.CDP_API_KEY_NAME;
    
    // Fallback to public API key for development (not recommended for production)
    const apiKey = apiKeySecret || process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;
    
    if (!apiKey) {
      logger.error('CDP_API_KEY_SECRET or NEXT_PUBLIC_ONCHAINKIT_API_KEY is not set. Cannot generate session token.');
      return NextResponse.json(
        { error: 'Server configuration error: CDP_API_KEY_SECRET not configured. Please set CDP_API_KEY_SECRET in your environment variables.' },
        { status: 500 }
      );
    }

    // Get client IP for security
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 
                     request.headers.get('cf-connecting-ip') ||
                     'unknown';

    // Create session token using new API format with addresses and assets
    // Note: Coinbase CDP API requires JWT Bearer tokens for authentication in production
    // For development, you can use the API key directly, but for production you should:
    // 1. Generate a JWT token using your secret API key
    // 2. Use that JWT token in the Authorization header
    // See: https://docs.cdp.coinbase.com/get-started/authentication/jwt-authentication
    const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(apiKeyName && { 'X-API-Key-Name': apiKeyName }),
      },
      body: JSON.stringify({
        addresses: [
          {
            address: address,
            blockchains: ['base', 'ethereum'], // Support Base and Ethereum
          },
        ],
        assets: ['USDC', 'ETH', 'USDT'], // Supported assets for purchase
        clientIp: clientIp,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to create Coinbase Onramp session token', new Error(errorText), {
        status: response.status,
        address,
      });
      
      return NextResponse.json(
        { error: 'Failed to create session token' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      sessionToken: data.sessionToken || data.token,
      expiresIn: data.expiresIn || 300, // Default 5 minutes
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });

  } catch (error) {
    logger.error(
      'Error generating Coinbase Onramp session token',
      error instanceof Error ? error : new Error(String(error))
    );

    return NextResponse.json(
      { error: 'Failed to generate session token' },
      { status: 500 }
    );
  }
}
