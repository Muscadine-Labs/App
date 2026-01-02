'use client';

import React from 'react';
import { useToast } from '@/contexts/ToastContext';
import { truncateAddress } from '@/lib/formatter';
import type { Address } from 'viem';

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
  const { showToast, error: showErrorToast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      showToast('Copied to clipboard', 'neutral', 2000);
    } catch {
      showErrorToast('Failed to copy to clipboard', 5000);
    }
  };

  const displayAddress = showFullAddress 
    ? address 
    : truncateAddress(address as Address, truncateLength, 4);

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
