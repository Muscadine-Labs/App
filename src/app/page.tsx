'use client';

import Dashboard from '@/components/common/Dashboard';
import { useTab } from '@/contexts/TabContext';

export default function Home() {
  const { activeTab } = useTab();

  return (
    <>
      {/* Tab Content */}
      <div className="flex-1">
        {activeTab === 'dashboard' && <Dashboard />}
      </div>
    </>
  );
}
