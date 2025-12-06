'use client';

import { useEffect, useRef } from 'react';
import { useReconnect } from 'wagmi';

/**
 * Handles wallet reconnection on page load.
 * This ensures that when the page reloads, wagmi properly reconnects
 * to the previously connected wallet instead of briefly showing connected
 * then disconnecting.
 * 
 * The issue occurs because cookie state restores the connection status,
 * but wagmi hasn't actually reconnected to the wallet provider yet.
 * This component ensures proper reconnection happens after wallet providers
 * have had time to initialize.
 */
export function ReconnectHandler() {
  const { reconnect } = useReconnect();
  const hasReconnected = useRef(false);

  useEffect(() => {
    // Only reconnect on client side, and only once
    if (typeof window !== 'undefined' && !hasReconnected.current) {
      // Wait for wallet providers (like Coinbase Wallet extension) to initialize
      // This delay ensures the wallet provider is ready before we try to reconnect
      const timeoutId = setTimeout(() => {
        hasReconnected.current = true;
        reconnect();
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [reconnect]);

  return null;
}
