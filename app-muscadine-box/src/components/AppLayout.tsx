'use client';

import type { ReactNode } from 'react';
import { NavBar } from '@/components/NavBar';
import { NavBarProvider } from '@/contexts/NavBarContext';
import { NotificationContainer } from './NotificationContainer';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <NavBarProvider>
      <div className="flex justify-end">
        <NavBar />
        <main className="ml-[var(--main-margin-left)] w-[var(--main-width)] transition-all duration-300">
              {children}
        </main>
      </div>
      <NotificationContainer />
    </NavBarProvider>
  );
}