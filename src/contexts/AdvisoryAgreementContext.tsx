'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
  const [isAccepted, setIsAccepted] = useState(false);
  const [shouldShowModal, setShouldShowModal] = useState(false);
  const [shouldOpenWalletConnect, setShouldOpenWalletConnect] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load acceptance state from localStorage on mount
  useEffect(() => {
    try {
      const storedAccepted = localStorage.getItem(STORAGE_KEY);
      const storedVersion = localStorage.getItem(VERSION_KEY);
      
      if (storedAccepted === 'true' && storedVersion === TERMS_VERSION) {
        setIsAccepted(true);
        setShouldShowModal(false);
      } else {
        // If version changed or no acceptance found, don't show modal until user clicks connect
        setIsAccepted(false);
        setShouldShowModal(false); // Only show when user clicks "Connect Wallet"
      }
    } catch {
      // If localStorage is not available (SSR), default to not showing modal
      setIsAccepted(false);
      setShouldShowModal(false); // Only show when user clicks "Connect Wallet"
    } finally {
      setIsInitialized(true);
    }
  }, []);

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

  // Don't render children until initialized to prevent flash
  if (!isInitialized) {
    return null;
  }

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
