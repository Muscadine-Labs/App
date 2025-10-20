'use client';

import Dashboard from '@/components/Dashboard';
import RightSidebar from '@/components/RightSidebar';
import { useState } from 'react';

export default function Home() {
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  return (
    <div className="w-full bg-[var(--background)] h-screen flex">
      {/* Main Content Area - Scrollable */}
      <div className={`flex-1 overflow-y-auto transition-all duration-300 ${isRightSidebarCollapsed ? 'mr-12' : 'mr-80'}`}>
        <Dashboard />
      </div>
      
      {/* Right Sidebar - Always Present */}
      <RightSidebar 
        isCollapsed={isRightSidebarCollapsed}
        onToggle={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
      />
    </div>
  );
}
