'use client';

import { useState, useEffect } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import { VaultAccount } from '@/types/vault';
import { useTransactionState } from '@/contexts/TransactionContext';
import { useVaultTransactions, TransactionProgressStep } from '@/hooks/useVaultTransactions';
import { isCancellationError, formatTransactionError } from '@/lib/transactionUtils';
import { TransactionConfirmation } from './TransactionConfirmation';
import { TransactionStatus as TransactionStatusComponent } from './TransactionStatus';
import { useToast } from '@/contexts/ToastContext';
import { useWallet } from '@/contexts/WalletContext';

interface TransactionFlowProps {
  onSuccess?: () => void;
}

export function TransactionFlow({ onSuccess }: TransactionFlowProps) {
  const {
    fromAccount,
    toAccount,
    amount,
    status,
    error,
    txHash,
    transactionType,
    derivedAsset,
    setStatus,
  } = useTransactionState();
  const { success, error: showErrorToast } = useToast();
  const { refreshBalances } = useWallet();

  const [currentTxHash, setCurrentTxHash] = useState<string | null>(null);
  const [prerequisiteReceipts, setPrerequisiteReceipts] = useState<Map<number, boolean>>(new Map());
  const [stepsInfo, setStepsInfo] = useState<Array<{ stepIndex: number; label: string; type: 'signing' | 'approving' | 'confirming'; txHash?: string }>>([]);
  const [totalSteps, setTotalSteps] = useState<number>(0);

  // Determine which vault address to use for transaction hook
  // Enable simulation when we're in preview or executing
  const vaultAddress = transactionType === 'deposit' 
    ? (toAccount as VaultAccount)?.address 
    : transactionType === 'withdraw' || transactionType === 'transfer'
    ? (fromAccount as VaultAccount)?.address
    : undefined;

  const shouldEnableSimulation = (status === 'preview' || status === 'signing' || status === 'approving' || status === 'confirming') && !!vaultAddress;
  const { executeVaultAction, isLoading } = useVaultTransactions(vaultAddress, shouldEnableSimulation);

  // Reset transaction hash and step when status changes
  useEffect(() => {
    if (status === 'idle' || status === 'preview') {
      setCurrentTxHash(null);
      setPrerequisiteReceipts(new Map());
      setStepsInfo([]);
      setTotalSteps(0);
    }
  }, [status]);

  // Wait for main transaction receipt
  const txHashToWaitFor = currentTxHash || txHash;
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHashToWaitFor as `0x${string}`,
    query: {
      enabled: !!txHashToWaitFor && status === 'confirming',
    },
  });

  // Wait for prerequisite transaction receipts
  const currentPrerequisiteStep = stepsInfo.find(step => 
    (step.type === 'signing' || step.type === 'approving') && 
    step.txHash && 
    !prerequisiteReceipts.get(step.stepIndex)
  );
  
  const { data: prerequisiteReceipt, error: prerequisiteReceiptError } = useWaitForTransactionReceipt({
    hash: currentPrerequisiteStep?.txHash as `0x${string}`,
    query: {
      enabled: !!currentPrerequisiteStep?.txHash && 
              (status === 'approving' || status === 'signing'),
    },
  });

  // Handle prerequisite transaction receipts
  useEffect(() => {
    if (prerequisiteReceipt && currentPrerequisiteStep) {
      setPrerequisiteReceipts(prev => new Map(prev).set(currentPrerequisiteStep.stepIndex, true));
    } else if (prerequisiteReceiptError && currentPrerequisiteStep) {
      if (isCancellationError(prerequisiteReceiptError)) {
        setStatus('preview');
        setCurrentTxHash(null);
        setPrerequisiteReceipts(new Map());
        setStepsInfo([]);
        setTotalSteps(0);
      } else {
        const errorMessage = formatTransactionError(prerequisiteReceiptError);
        showErrorToast(errorMessage, 5000);
        setStatus('error', errorMessage);
      }
    }
  }, [prerequisiteReceipt, prerequisiteReceiptError, currentPrerequisiteStep, setStatus, showErrorToast]);

  // Handle transaction receipt
  useEffect(() => {
    const hashToUse = currentTxHash || txHash;
    if (receipt && status === 'confirming' && hashToUse) {
      success('Transaction confirmed!', 3000);
      setStatus('success', undefined, hashToUse);
      // Refresh wallet balances immediately after transaction confirmation
      refreshBalances();
      // Don't auto-close - let user see the confirmation page with details
    } else if (receiptError && status === 'confirming' && hashToUse) {
      if (isCancellationError(receiptError)) {
        setStatus('preview');
        setCurrentTxHash(null);
        setPrerequisiteReceipts(new Map());
        setStepsInfo([]);
        setTotalSteps(0);
      } else {
        const errorMessage = formatTransactionError(receiptError);
        showErrorToast(errorMessage, 5000);
        setStatus('error', errorMessage);
      }
    }
  }, [receipt, receiptError, status, txHash, currentTxHash, setStatus, onSuccess, success, showErrorToast, refreshBalances]);

  const handleConfirm = async () => {
    if (!fromAccount || !toAccount || !amount || !transactionType) return;

    // Derive asset if not already computed
    const assetToUse = derivedAsset || (fromAccount.type === 'vault' 
      ? { symbol: (fromAccount as VaultAccount).symbol, decimals: (fromAccount as VaultAccount).assetDecimals ?? 18 }
      : toAccount.type === 'vault'
      ? { symbol: (toAccount as VaultAccount).symbol, decimals: (toAccount as VaultAccount).assetDecimals ?? 18 }
      : null);

    if (!assetToUse) {
      const errorMessage = 'Unable to determine asset type. Please try again.';
      setStatus('error', errorMessage);
      showErrorToast(errorMessage, 5000);
      return;
    }

    try {
      setStatus('confirming');
      
      const onProgress = (step: TransactionProgressStep) => {
        setTotalSteps(step.totalSteps);
        
        setStepsInfo(prev => {
          const newSteps = [...prev];
          const existingIndex = newSteps.findIndex(s => s.stepIndex === step.stepIndex);
          const stepInfo = {
            stepIndex: step.stepIndex,
            label: step.stepLabel || (step.type === 'signing' ? 'Pre authorize' : step.type === 'approving' ? 'Pre authorize' : 'Confirm'),
            type: step.type,
            txHash: step.type === 'confirming' ? step.txHash : (step.type === 'approving' ? step.txHash : undefined)
          };
          
          if (existingIndex >= 0) {
            newSteps[existingIndex] = stepInfo;
          } else {
            while (newSteps.length <= step.stepIndex) {
              newSteps.push({ stepIndex: newSteps.length, label: '', type: 'confirming' });
            }
            newSteps[step.stepIndex] = stepInfo;
          }
          
          return newSteps;
        });
        
        if (step.type === 'signing') {
          setStatus('signing');
        } else if (step.type === 'approving') {
          setStatus('approving');
        } else if (step.type === 'confirming') {
          if (step.txHash) {
            setCurrentTxHash(step.txHash);
          }
          setStatus('confirming', undefined, step.txHash);
        }
      };

      let txHash: string;

      if (transactionType === 'deposit') {
        const vaultAddress = (toAccount as VaultAccount).address;
        txHash = await executeVaultAction('deposit', vaultAddress, amount, onProgress, undefined, assetToUse.decimals);
      } else if (transactionType === 'withdraw') {
        const vaultAddress = (fromAccount as VaultAccount).address;
        txHash = await executeVaultAction('withdraw', vaultAddress, amount, onProgress, undefined, assetToUse.decimals);
      } else if (transactionType === 'transfer') {
        // For transfer, withdraw from source vault and deposit to destination vault in single bundle
        const sourceVaultAddress = (fromAccount as VaultAccount).address;
        const destVaultAddress = (toAccount as VaultAccount).address;
        txHash = await executeVaultAction('transfer', sourceVaultAddress, amount, onProgress, destVaultAddress, assetToUse.decimals);
      } else {
        throw new Error('Invalid transaction type');
      }

      if (!currentTxHash && txHash) {
        setCurrentTxHash(txHash);
      }

    } catch (err) {
      if (isCancellationError(err)) {
        setStatus('preview');
        setCurrentTxHash(null);
        setPrerequisiteReceipts(new Map());
        setStepsInfo([]);
        setTotalSteps(0);
        return;
      }
      
      const errorMessage = formatTransactionError(err);
      setStatus('error', errorMessage);
      showErrorToast(errorMessage, 5000);
    }
  };

  const isSigning = status === 'signing';
  const isApproving = status === 'approving';
  const isConfirming = status === 'confirming';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isPreview = status === 'preview';

  if (!isPreview && (!fromAccount || !toAccount || !derivedAsset)) {
    return null;
  }

  if (isPreview && (!fromAccount || !toAccount)) {
    return null;
  }

  // Calculate steps for wallet progress bar (shown in confirmation modal)
  const walletSteps = (isSigning || isApproving || isConfirming || isSuccess) ? (() => {
    const effectiveTotalSteps = totalSteps > 0 ? totalSteps : (stepsInfo.length > 0 ? Math.max(...stepsInfo.map(s => s.stepIndex)) + 1 : 0);
    
    if (effectiveTotalSteps > 0) {
      return Array.from({ length: effectiveTotalSteps }, (_, i) => {
        const stepInfo = stepsInfo.find(s => s.stepIndex === i);
        const isCompleted = stepInfo 
          ? (stepInfo.type === 'confirming' ? !!receipt : !!prerequisiteReceipts.get(i))
          : false;
        const isActive = stepInfo 
          ? ((stepInfo.type === 'signing' && isSigning) ||
             (stepInfo.type === 'approving' && isApproving) ||
             (stepInfo.type === 'confirming' && isConfirming)) && !isCompleted
          : false;
        
        const label = stepInfo?.label || (i === stepsInfo.filter(s => s.type === 'approving').length ? 'Confirm' : `Step ${i + 1}`);
        
        return {
          label,
          completed: isCompleted || (isSuccess && i < effectiveTotalSteps),
          active: isActive
        };
      });
    }
    
    if (isSuccess) {
      return [{ label: 'Confirm', completed: true, active: false }];
    }
    
    return [
      { label: 'Pre authorize', completed: false, active: isApproving || isSigning },
      { label: 'Confirm', completed: false, active: isConfirming }
    ];
  })() : [];

  const assetSymbol = derivedAsset?.symbol || (fromAccount?.type === 'vault' 
    ? (fromAccount as VaultAccount).symbol 
    : toAccount?.type === 'vault' 
    ? (toAccount as VaultAccount).symbol 
    : '');

  return (
    <div className="space-y-6">
      {/* Progress bar is now shown at the page level */}

      {/* Transaction Confirmation - Show during preview, transaction flow, and success */}
      {(isPreview || isSigning || isApproving || isConfirming || isSuccess) && fromAccount && toAccount && (
        <TransactionConfirmation
          fromAccount={fromAccount}
          toAccount={toAccount}
          amount={amount || ''}
          assetSymbol={assetSymbol}
          assetDecimals={derivedAsset?.decimals}
          transactionType={transactionType}
          isLoading={isLoading || isSigning || isApproving || isConfirming}
          progressSteps={walletSteps}
          showProgress={isSigning || isApproving || isConfirming}
          isSuccess={isSuccess}
          txHash={currentTxHash}
          onCancel={() => {
            if (isSigning || isApproving || isConfirming) {
              // If transaction is in progress, reset to preview
              setStatus('preview');
              setCurrentTxHash(null);
              setPrerequisiteReceipts(new Map());
              setStepsInfo([]);
              setTotalSteps(0);
            } else if (isSuccess) {
              // If success, call onSuccess callback to reset
              if (onSuccess) {
                onSuccess();
              }
            } else {
              setStatus('idle');
            }
          }}
          onConfirm={handleConfirm}
        />
      )}

      {/* Error State */}
      {isError && (
        <TransactionStatusComponent
          type="error"
          message={error || 'Transaction failed'}
          onRetry={() => setStatus('preview')}
        />
      )}
    </div>
  );
}

