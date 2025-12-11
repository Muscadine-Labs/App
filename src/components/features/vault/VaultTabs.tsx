'use client';

interface VaultTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'position', label: 'My Position' },
  { id: 'history', label: 'History' },
];

export default function VaultTabs({ activeTab, onTabChange }: VaultTabsProps) {
  return (
    <div className="flex gap-2 border-b border-[var(--border-subtle)] mb-8">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-6 py-4 text-base font-medium transition-colors relative ${
            activeTab === tab.id
              ? 'text-[var(--foreground)]'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)] -mb-px" />
          )}
        </button>
      ))}
    </div>
  );
}

