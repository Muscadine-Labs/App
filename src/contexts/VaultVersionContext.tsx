'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type VaultVersion = 'v1' | 'v2' | 'all';

interface VaultVersionContextType {
  version: VaultVersion;
  setVersion: (version: VaultVersion) => void;
}

const VaultVersionContext = createContext<VaultVersionContextType | undefined>(undefined);

export function VaultVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState<VaultVersion>('v2'); // Default to v2

  return (
    <VaultVersionContext.Provider value={{ version, setVersion }}>
      {children}
    </VaultVersionContext.Provider>
  );
}

export function useVaultVersion() {
  const context = useContext(VaultVersionContext);
  if (context === undefined) {
    throw new Error('useVaultVersion must be used within a VaultVersionProvider');
  }
  return context;
}

