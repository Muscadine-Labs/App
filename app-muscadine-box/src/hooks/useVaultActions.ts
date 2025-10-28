import { useCallback } from 'react';
import { useTransactionModal } from '../contexts/TransactionModalContext';
import { useVaultTransactions } from '../hooks/useVaultTransactions';

export function useVaultActions() {
  const { openTransactionModal } = useTransactionModal();
  const { deposit, withdrawAll, withdrawAssets } = useVaultTransactions();

  const openDepositModal = useCallback((
    vaultAddress: string,
    vaultName: string,
    vaultSymbol: string,
    amount?: string
  ) => {
    openTransactionModal('deposit', vaultAddress, vaultName, vaultSymbol, amount);
  }, [openTransactionModal]);

  const openWithdrawModal = useCallback((
    vaultAddress: string,
    vaultName: string,
    vaultSymbol: string,
    amount?: string
  ) => {
    openTransactionModal('withdraw', vaultAddress, vaultName, vaultSymbol, amount);
  }, [openTransactionModal]);

  const openWithdrawAllModal = useCallback((
    vaultAddress: string,
    vaultName: string,
    vaultSymbol: string
  ) => {
    openTransactionModal('withdrawAll', vaultAddress, vaultName, vaultSymbol);
  }, [openTransactionModal]);

  return {
    openDepositModal,
    openWithdrawModal,
    openWithdrawAllModal,
    // Direct transaction functions (for advanced usage)
    deposit,
    withdrawAll,
    withdrawAssets,
  };
}
