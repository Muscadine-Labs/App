'use client';

import { Button } from '@/components/ui';

interface TransactionStatusProps {
  type: 'success' | 'error';
  message: string;
  txHash?: string | null;
  onRetry?: () => void;
}

export function TransactionStatus({ type, message, txHash, onRetry }: TransactionStatusProps) {
  if (type === 'success') {
    return (
      <div className="flex items-center gap-3 p-4 bg-[var(--success-subtle)] rounded-lg border border-[var(--success)]">
        <div className="w-8 h-8 rounded-full bg-[var(--success)] flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {message}
          </p>
          {txHash && (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors mt-1 inline-flex items-center gap-1"
            >
              <span className="font-mono">{`${txHash.slice(0, 6)}...${txHash.slice(-4)}`}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 p-4 bg-[var(--danger-subtle)] rounded-lg border border-[var(--danger)]">
        <div className="w-8 h-8 rounded-full bg-[var(--danger)] flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="primary"
          size="lg"
          fullWidth
        >
          Try Again
        </Button>
      )}
    </>
  );
}

