'use client';

import { useState, useCallback, useMemo } from 'react';
import { Account, VaultAccount } from '../types/vault';

export type TransactionType = 'deposit' | 'withdraw' | 'transfer';

export interface SelectedAsset {
  symbol: string;
  address: string;
  decimals: number;
}

export type TransactionStatus = 
  | 'idle'
  | 'preview'
  | 'signing'
  | 'approving'
  | 'confirming'
  | 'success'
  | 'error';

export interface TransactionState {
  fromAccount: Account | null;
  toAccount: Account | null;
  amount: string;
  status: TransactionStatus;
  error: string | null;
  txHash: string | null;
  transactionType: TransactionType | null;
}

export function useTransactionState() {
  const [state, setState] = useState<TransactionState>({
    fromAccount: null,
    toAccount: null,
    amount: '',
    status: 'idle',
    error: null,
    txHash: null,
    transactionType: null,
  });

  // Determine transaction type based on from/to accounts
  // Wallet-to-wallet transactions are not allowed
  const transactionType = useMemo<TransactionType | null>(() => {
    if (!state.fromAccount || !state.toAccount) return null;

    // Prevent wallet-to-wallet transactions
    if (state.fromAccount.type === 'wallet' && state.toAccount.type === 'wallet') {
      return null;
    }

    if (state.fromAccount.type === 'wallet' && state.toAccount.type === 'vault') {
      return 'deposit';
    } else if (state.fromAccount.type === 'vault' && state.toAccount.type === 'wallet') {
      return 'withdraw';
    } else if (state.fromAccount.type === 'vault' && state.toAccount.type === 'vault') {
      return 'transfer';
    }

    return null;
  }, [state.fromAccount, state.toAccount]);

  const setFromAccount = useCallback((account: Account | null) => {
    setState(prev => ({ ...prev, fromAccount: account }));
  }, []);

  const setToAccount = useCallback((account: Account | null) => {
    setState(prev => ({ ...prev, toAccount: account }));
  }, []);

  const setAmount = useCallback((amount: string) => {
    setState(prev => ({ ...prev, amount }));
  }, []);

  const setStatus = useCallback((status: TransactionStatus, error?: string | null, txHash?: string | null) => {
    setState(prev => ({
      ...prev,
      status,
      error: error ?? null,
      txHash: txHash ?? null,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      fromAccount: null,
      toAccount: null,
      amount: '',
      status: 'idle',
      error: null,
      txHash: null,
      transactionType: null,
    });
  }, []);

  // Check if accounts are compatible (same asset for vault-to-vault transfers)
  const areAccountsCompatible = useMemo(() => {
    if (!state.fromAccount || !state.toAccount) return true; // Allow selection

    // Wallet transfers are always compatible
    if (state.fromAccount.type === 'wallet' || state.toAccount.type === 'wallet') {
      return true;
    }

    // For vault-to-vault, check if same asset
    const fromVault = state.fromAccount as VaultAccount;
    const toVault = state.toAccount as VaultAccount;
    
    return fromVault.assetAddress.toLowerCase() === toVault.assetAddress.toLowerCase() &&
           fromVault.symbol.toUpperCase() === toVault.symbol.toUpperCase();
  }, [state.fromAccount, state.toAccount]);

  // Derive asset from selected accounts
  const derivedAsset = useMemo(() => {
    // If both accounts are vaults, they should have the same asset (for transfers)
    if (state.fromAccount?.type === 'vault') {
      const vaultAccount = state.fromAccount as VaultAccount;
      return {
        symbol: vaultAccount.symbol,
        decimals: vaultAccount.assetDecimals ?? 18,
      };
    }
    if (state.toAccount?.type === 'vault') {
      const vaultAccount = state.toAccount as VaultAccount;
      return {
        symbol: vaultAccount.symbol,
        decimals: vaultAccount.assetDecimals ?? 18,
      };
    }
    // If both are wallets, we can't determine asset (shouldn't happen in practice)
    return null;
  }, [state.fromAccount, state.toAccount]);

  return {
    ...state,
    transactionType,
    areAccountsCompatible,
    derivedAsset,
    setFromAccount,
    setToAccount,
    setAmount,
    setStatus,
    reset,
  };
}

