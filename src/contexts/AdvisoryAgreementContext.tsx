'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

const TERMS_VERSION = '1.0.0'; // Increment this when terms change to force re-acceptance
const STORAGE_KEY = 'advisory-agreement-accepted';
const VERSION_KEY = 'advisory-agreement-version';

interface AdvisoryAgreementData {
  accepted: boolean;
  version: string;
  timestamp: number;
}

interface AdvisoryAgreementContextType {
  isAccepted: boolean;
  shouldShowModal: boolean;
  shouldOpenWalletConnect: boolean;
  acceptAgreement: () => void;
  declineAgreement: () => void;
  openModal: () => void;
  closeModal: () => void;
  clearWalletConnectFlag: () => void;
}

const AdvisoryAgreementContext = createContext<AdvisoryAgreementContextType | undefined>(undefined);

export function AdvisoryAgreementProvider({ children }: { children: React.ReactNode }) {
  // Use lazy initialization to avoid setState in effect and prevent SSR issues
  const [isAccepted, setIsAccepted] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const storedAccepted = localStorage.getItem(STORAGE_KEY);
      const storedVersion = localStorage.getItem(VERSION_KEY);
      return storedAccepted === 'true' && storedVersion === TERMS_VERSION;
    } catch {
      return false;
    }
  });
  const [shouldShowModal, setShouldShowModal] = useState(false);
  const [shouldOpenWalletConnect, setShouldOpenWalletConnect] = useState(false);

  const acceptAgreement = useCallback(() => {
    try {
      const agreementData: AdvisoryAgreementData = {
        accepted: true,
        version: TERMS_VERSION,
        timestamp: Date.now(),
      };
      
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(VERSION_KEY, TERMS_VERSION);
      localStorage.setItem('advisory-agreement-data', JSON.stringify(agreementData));
      
      setIsAccepted(true);
      setShouldShowModal(false);
      setShouldOpenWalletConnect(true); // Flag to open wallet connect modal after acceptance
    } catch (error) {
      console.error('Failed to save advisory agreement acceptance:', error);
    }
  }, []);

  const declineAgreement = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VERSION_KEY);
      localStorage.removeItem('advisory-agreement-data');
      
      setIsAccepted(false);
      setShouldShowModal(false);
    } catch (error) {
      console.error('Failed to clear advisory agreement acceptance:', error);
    }
  }, []);

  const openModal = useCallback(() => {
    setShouldShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShouldShowModal(false);
  }, []);

  const clearWalletConnectFlag = useCallback(() => {
    setShouldOpenWalletConnect(false);
  }, []);

  const value: AdvisoryAgreementContextType = {
    isAccepted,
    shouldShowModal,
    shouldOpenWalletConnect,
    acceptAgreement,
    declineAgreement,
    openModal,
    closeModal,
    clearWalletConnectFlag,
  };

  return (
    <AdvisoryAgreementContext.Provider value={value}>
      {children}
    </AdvisoryAgreementContext.Provider>
  );
}

export function useAdvisoryAgreement() {
  const context = useContext(AdvisoryAgreementContext);
  if (context === undefined) {
    throw new Error('useAdvisoryAgreement must be used within an AdvisoryAgreementProvider');
  }
  return context;
}
