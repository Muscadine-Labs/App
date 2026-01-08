'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Mini App SDK Initialization
 * Calls ready() to hide the loading splash screen and display the app
 */
export function MiniAppInit() {
  useEffect(() => {
    // Call ready() as soon as possible to prevent jitter and content reflows
    sdk.actions.ready();
  }, []);

  return null;
}

