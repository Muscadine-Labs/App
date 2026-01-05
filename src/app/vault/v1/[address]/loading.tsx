import { Skeleton } from '@/components/ui/Skeleton';

export default function VaultLoading() {
  return (
    <div 
      className="w-full bg-[var(--background)] flex flex-col overflow-hidden p-4 sm:p-6 md:p-8" 
      style={{ height: 'calc(100vh - var(--navbar-height))' }}
    >
      {/* Hero Section Skeleton */}
      <div className="flex-shrink-0 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton width="12rem" height="3rem" />
            <div className="flex items-center gap-2">
              <Skeleton variant="circular" width="1.25rem" height="1.25rem" />
              <Skeleton width="4rem" height="1rem" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="flex-shrink-0 mb-8">
        <div className="flex gap-2 border-b border-[var(--border-subtle)]">
          <Skeleton width="6rem" height="3rem" className="mb-2" />
          <Skeleton width="8rem" height="3rem" className="mb-2" />
          <Skeleton width="6rem" height="3rem" className="mb-2" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="flex-1 min-h-0 space-y-6">
        <Skeleton width="100%" height="16rem" />
        <div className="space-y-4">
          <Skeleton width="100%" height="4rem" />
          <Skeleton width="100%" height="4rem" />
          <Skeleton width="100%" height="4rem" />
        </div>
      </div>
    </div>
  );
}

