'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { logger } from '@/lib/logger';

export default function VaultV2Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    logger.error('Vault v2 page error', error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
          Something went wrong!
        </h2>
        <p className="text-[var(--foreground-secondary)] text-sm mb-4">
          {error.message || 'Failed to load vault'}
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          onClick={() => reset()}
          variant="primary"
          size="md"
        >
          Try again
        </Button>
        <Button
          onClick={() => router.push('/')}
          variant="secondary"
          size="md"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

