'use client';

import { useAccount } from 'wagmi';
import Dashboard from '@/components/Dashboard';
import ConnectScreen from '@/components/ConnectScreen';
import RightSidebar from '@/components/RightSidebar';
import { useState } from 'react';

export default function Home() {
  const { isConnected, status } = useAccount();
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  return (
    <div className="w-full bg-[var(--background)] h-screen flex">
      {/* Main Content Area - Scrollable */}
      <div className={`flex-1 overflow-y-auto transition-all duration-300 ${isRightSidebarCollapsed ? 'mr-12' : 'mr-80'}`}>
        {/* Show ConnectScreen when not connected or reconnecting */}
        {!isConnected || status === 'reconnecting' ? (
          <div className="flex items-center justify-center h-screen">
            <ConnectScreen />
          </div>
        ) : (
          <Dashboard />
        )}
      </div>
      
      {/* Right Sidebar - Always Present */}
      <RightSidebar 
        isCollapsed={isRightSidebarCollapsed}
        onToggle={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
      />
    </div>
  );
}
