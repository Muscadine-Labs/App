'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Mini App SDK Initialization
 * Calls ready() to hide the loading splash screen and display the app
 */
export function MiniAppInit() {
  useEffect(() => {
    // Async helper to initialize the SDK with proper error handling
    const initializeSDK = async () => {
      try {
        await sdk.actions.ready();
      } catch (error) {
        console.error('Failed to initialize MiniApp SDK:', error);
        // Optionally implement retry logic or fallback behavior here
      }
    };

    // Call ready() as soon as possible to prevent jitter and content reflows
    initializeSDK();
  }, []);

  return null;
}

