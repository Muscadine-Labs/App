'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export type TransactionType = 'deposit' | 'withdraw' | 'withdrawAll';

export type TransactionStatus = 
  | 'idle' 
  | 'authorizing' 
  | 'authorized' 
  | 'depositing' 
  | 'confirming' 
  | 'success' 
  | 'error';

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
  step: 'authorize' | 'deposit' | null;
  isPageVisible: boolean;
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
  setTransactionAmount: (amount: string) => void;
  moveToNextStep: () => void;
}

const TransactionModalContext = createContext<TransactionModalContextType | undefined>(undefined);

const initialModalState: TransactionModalState = {
  isOpen: false,
  type: null,
  vaultAddress: null,
  vaultName: null,
  vaultSymbol: null,
  amount: null,
  status: 'idle',
  error: null,
  txHash: null,
  step: null,
  isPageVisible: true,
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
    setModalState({
      isOpen: true,
      type,
      vaultAddress,
      vaultName,
      vaultSymbol,
      amount: amount || null,
      status: 'idle',
      error: null,
      txHash: null,
      step: type === 'deposit' ? 'authorize' : null,
      isPageVisible,
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

  const setTransactionAmount = useCallback((amount: string) => {
    setModalState(prev => ({
      ...prev,
      amount,
    }));
  }, []);

  const moveToNextStep = useCallback(() => {
    setModalState(prev => {
      if (prev.step === 'authorize') {
        return {
          ...prev,
          step: 'deposit',
          status: 'idle',
          error: null,
          txHash: null,
        };
      }
      return prev;
    });
  }, []);

  return (
    <TransactionModalContext.Provider value={{
      modalState: { ...modalState, isPageVisible },
      openTransactionModal,
      closeTransactionModal,
      updateTransactionStatus,
      setTransactionAmount,
      moveToNextStep,
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
