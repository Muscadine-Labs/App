'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';

interface CopiableAddressProps {
  address: string;
  className?: string;
  showFullAddress?: boolean;
  truncateLength?: number;
}

export default function CopiableAddress({ 
  address, 
  className = '', 
  showFullAddress = false,
  truncateLength = 6 
}: CopiableAddressProps) {
  const [copied, setCopied] = useState(false);
  const { addNotification } = useNotifications();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      
      addNotification({
        type: 'success',
        title: 'Address Copied',
        message: `Vault address copied to clipboard`,
        duration: 3000,
      });

      // Reset the copied state after a short delay
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addNotification({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy address to clipboard',
        duration: 3000,
      });
    }
  };

  const displayAddress = showFullAddress 
    ? address 
    : `${address.slice(0, truncateLength)}...${address.slice(-4)}`;

  return (
    <button
      onClick={handleCopy}
      className={`font-figtree text-sm transition-all duration-200 hover:bg-[var(--surface-hover)] rounded px-2 py-1 ${className} ${
        copied ? 'text-[var(--success)]' : 'text-[var(--foreground)]'
      }`}
      title={`Click to copy: ${address}`}
    >
      {displayAddress}
    </button>
  );
}
