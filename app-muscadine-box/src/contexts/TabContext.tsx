'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Vault } from '../types/vault';

type TabType = 'dashboard' | 'learn';

interface TabContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  selectedVault: Vault | null;
  setSelectedVault: (vault: Vault | null) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

interface TabProviderProps {
  children: ReactNode;
}

export function TabProvider({ children }: TabProviderProps) {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);

  const value: TabContextType = {
    activeTab,
    setActiveTab,
    selectedVault,
    setSelectedVault,
  };

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
}

export function useTab() {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTab must be used within a TabProvider');
  }
  return context;
}
