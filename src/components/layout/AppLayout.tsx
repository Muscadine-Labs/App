'use client';

import React, { type ReactNode, useState, useEffect } from 'react';
import { NavBar } from './NavBar';
import RightSidebar from './RightSidebar';

export function AppLayout({ children }: { children: ReactNode }) {
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(true);

  return (
    <>
      <LayoutContent 
        isRightSidebarCollapsed={isRightSidebarCollapsed}
        setIsRightSidebarCollapsed={setIsRightSidebarCollapsed}
      >
        {children}
      </LayoutContent>
    </>
  );
}

function LayoutContent({ 
  children, 
  isRightSidebarCollapsed, 
  setIsRightSidebarCollapsed 
}: { 
  children: ReactNode;
  isRightSidebarCollapsed: boolean;
  setIsRightSidebarCollapsed: (collapsed: boolean) => void;
}) {
  // Update CSS variables when sidebar state changes
  useEffect(() => {
    const root = document.documentElement;
    
    // Calculate sidebar margin - 0 when collapsed, full width when open
    const sidebarMargin = isRightSidebarCollapsed ? '0px' : 'var(--sidebar-width)';
    
    // Calculate main width considering only sidebar (navbar is now at top)
    const mainWidth = `calc(100vw - ${sidebarMargin})`;
    
    root.style.setProperty('--main-margin-right', sidebarMargin);
    root.style.setProperty('--main-width', mainWidth);
  }, [isRightSidebarCollapsed]);

  return (
    <div className="w-full bg-[var(--background)] h-screen flex flex-col">
      {/* Top NavBar */}
      <NavBar 
        isRightSidebarCollapsed={isRightSidebarCollapsed}
        onToggleSidebar={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
      />
      
      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden mt-[var(--navbar-height)]" style={{ height: 'calc(100vh - var(--navbar-height))' }}>
        {/* Main Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto transition-all duration-300">
          <main className="w-full transition-all duration-300">
            {children}
          </main>
        </div>
        
        {/* Right Sidebar - Always Present */}
        <RightSidebar 
          isCollapsed={isRightSidebarCollapsed}
        />
      </div>
    </div>
  );
}