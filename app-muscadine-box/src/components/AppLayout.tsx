'use client';

import type { ReactNode } from 'react';
import { NavBar } from './NavBar';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <NavBar />
      <main className="ml-[var(--main-margin-left)] w-[var(--main-width)] transition-all duration-300">
            {children}
      </main>
    </div>
  );
}