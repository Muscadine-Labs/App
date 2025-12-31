'use client';

import React from 'react';
import { useToast } from '@/contexts/ToastContext';

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
  const { success } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      success('Copied to clipboard', 2000);
    } catch {
      // Silently fail - toast will handle error feedback if needed
    }
  };

  const displayAddress = showFullAddress 
    ? address 
    : `${address.slice(0, truncateLength)}...${address.slice(-4)}`;

  return (
    <button
      onClick={handleCopy}
      className={`font-figtree text-sm transition-all duration-200 text-left ${className} text-[var(--foreground)] hover:text-[var(--primary)]`}
      title={`Click to copy: ${address}`}
    >
      {displayAddress}
    </button>
  );
}
