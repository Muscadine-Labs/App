'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6 p-6">
      <div className="text-center space-y-4">
        <div className="text-6xl md:text-8xl font-bold text-[var(--foreground)] mb-2">
          404
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold text-[var(--foreground)]">
          Oops! This page got lost in the vault
        </h2>
        <p className="text-[var(--foreground-secondary)] text-base max-w-md mx-auto leading-relaxed">
          Hey there! It looks like the page you're looking for doesn't exist. If you think this is an error, please contact our support.
        </p>
      </div>
      <div className="flex gap-3 flex-col sm:flex-row">
        <Button
          onClick={() => router.push('/')}
          variant="primary"
          size="lg"
        >
          Return to Dashboard
        </Button>
        <Button
          onClick={() => router.back()}
          variant="secondary"
          size="lg"
        >
          Go Back
        </Button>
      </div>
    </div>
  );
}

