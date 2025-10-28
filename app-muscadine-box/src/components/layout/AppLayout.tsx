'use client';

import React, { type ReactNode, useState, useEffect } from 'react';
import { NavBar } from './NavBar';
import { NavBarProvider, useNavBar } from '@/contexts/NavBarContext';
import { TabProvider } from '@/contexts/TabContext';
import { NotificationContainer } from '../common/NotificationContainer';
import RightSidebar from './RightSidebar';

export function AppLayout({ children }: { children: ReactNode }) {
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);

  return (
    <NavBarProvider>
      <TabProvider>
        <LayoutContent 
          isRightSidebarCollapsed={isRightSidebarCollapsed}
          setIsRightSidebarCollapsed={setIsRightSidebarCollapsed}
        >
          {children}
        </LayoutContent>
        <NotificationContainer />
      </TabProvider>
    </NavBarProvider>
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
  const { isCollapsed: isNavbarCollapsed } = useNavBar();

  // Update CSS variables when either sidebar state changes
  useEffect(() => {
    const root = document.documentElement;
    
    // Calculate navbar margin
    const navbarMargin = isNavbarCollapsed ? 'var(--navbar-collapsed-width)' : 'var(--navbar-width)';
    
    // Calculate sidebar margin  
    const sidebarMargin = isRightSidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
    
    // Calculate main width considering both navbar and sidebar
    const mainWidth = `calc(100vw - ${navbarMargin} - ${sidebarMargin})`;
    
    root.style.setProperty('--main-margin-left', navbarMargin);
    root.style.setProperty('--main-margin-right', sidebarMargin);
    root.style.setProperty('--main-width', mainWidth);
  }, [isNavbarCollapsed, isRightSidebarCollapsed]);

  return (
    <div className="w-full bg-[var(--background)] h-screen flex">
      {/* Left NavBar */}
      <NavBar />
      
      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto transition-all duration-300" style={{ marginRight: 'var(--main-margin-right)' }}>
        <main className="ml-[var(--main-margin-left)] w-[var(--main-width)] transition-all duration-300">
          {children}
        </main>
      </div>
      
      {/* Right Sidebar - Always Present */}
      <RightSidebar 
        isCollapsed={isRightSidebarCollapsed}
        onToggle={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
      />
    </div>
  );
}