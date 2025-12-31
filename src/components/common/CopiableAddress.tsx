'use client';

import React, { useState } from 'react';

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      // Reset the copied state after a short delay
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail - the visual feedback (copied state) will handle it
    }
  };

  const displayAddress = showFullAddress 
    ? address 
    : `${address.slice(0, truncateLength)}...${address.slice(-4)}`;

  return (
    <button
      onClick={handleCopy}
      className={`font-figtree text-sm transition-all duration-200 text-left ${className} ${
        copied 
          ? 'text-[var(--success)]' 
          : 'text-[var(--foreground)] hover:text-[var(--primary)]'
      }`}
      title={`Click to copy: ${address}`}
    >
      {displayAddress}
    </button>
  );
}
