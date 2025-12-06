'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type TransactionType = 'deposit' | 'withdraw' | 'withdrawAll';

export type TransactionStatus = 
  | 'preview' 
  | 'signing'
  | 'approving'
  | 'confirming' 
  | 'success' 
  | 'error' 
  | 'cancelled';

export interface TransactionStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  contractAddress?: string;
}

export interface TransactionModalState {
  isOpen: boolean;
  type: TransactionType | null;
  vaultAddress: string | null;
  vaultName: string | null;
  vaultSymbol: string | null;
  amount: string | null;
  status: TransactionStatus;
  error: string | null;
  txHash: string | null;
  isPageVisible: boolean;
  steps: TransactionStep[];
  currentStepIndex: number;
}

interface TransactionModalContextType {
  modalState: TransactionModalState;
  openTransactionModal: (
    type: TransactionType,
    vaultAddress: string,
    vaultName: string,
    vaultSymbol: string,
    amount?: string
  ) => void;
  closeTransactionModal: () => void;
  updateTransactionStatus: (status: TransactionStatus, error?: string, txHash?: string) => void;
}

const TransactionModalContext = createContext<TransactionModalContextType | undefined>(undefined);

const initialModalState: TransactionModalState = {
  isOpen: false,
  type: null,
  vaultAddress: null,
  vaultName: null,
  vaultSymbol: null,
  amount: null,
  status: 'preview',
  error: null,
  txHash: null,
  isPageVisible: true,
  steps: [],
  currentStepIndex: 0,
};

export function TransactionModalProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<TransactionModalState>(initialModalState);
  const [isPageVisible, setIsPageVisible] = useState(true);

  // Track page visibility for wallet interactions
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    const handleWindowFocus = () => setIsPageVisible(true);
    const handleWindowBlur = () => setIsPageVisible(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  const openTransactionModal = useCallback((
    type: TransactionType,
    vaultAddress: string,
    vaultName: string,
    vaultSymbol: string,
    amount?: string
  ) => {
    // Always explicitly set amount - clear it if not provided or empty
    const normalizedAmount = amount && amount.trim() ? amount.trim() : null;
    
    setModalState({
      isOpen: true,
      type,
      vaultAddress,
      vaultName,
      vaultSymbol,
      amount: normalizedAmount,
      status: 'preview',
      error: null,
      txHash: null,
      isPageVisible,
      steps: [],
      currentStepIndex: 0,
    });
  }, [isPageVisible]);

  const closeTransactionModal = useCallback(() => {
    setModalState(initialModalState);
  }, []);

  const updateTransactionStatus = useCallback((
    status: TransactionStatus,
    error?: string,
    txHash?: string
  ) => {
    setModalState(prev => ({
      ...prev,
      status,
      error: error || null,
      txHash: txHash || null,
    }));
  }, []);


  return (
    <TransactionModalContext.Provider value={{
      modalState: { ...modalState, isPageVisible },
      openTransactionModal,
      closeTransactionModal,
      updateTransactionStatus,
    }}>
      {children}
    </TransactionModalContext.Provider>
  );
}

export function useTransactionModal() {
  const context = useContext(TransactionModalContext);
  if (context === undefined) {
    throw new Error('useTransactionModal must be used within a TransactionModalProvider');
  }
  return context;
}
