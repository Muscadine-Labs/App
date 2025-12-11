export default function VaultLoading() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      <p className="text-[var(--foreground-muted)] text-sm mt-4">
        Loading vault...
      </p>
    </div>
  );
}

