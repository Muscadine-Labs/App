'use client';

import type { ReactNode } from 'react';
import { NavBar } from './NavBar';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <NavBar />
      <main className="ml-20 w-[calc(100vw-var(--navbar-width))]">
            {children}
      </main>
    </div>
  );
}