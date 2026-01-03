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
import { useVaultData } from '@/contexts/VaultDataContext';
import { VAULTS } from '@/lib/vaults';
import { logger } from '@/lib/logger';

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
  const { refreshBalancesWithPolling, morphoHoldings } = useWallet();
  const { fetchVaultData } = useVaultData();

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
    
    // Log receipt status for debugging
    if (receipt) {
      logger.info('Transaction receipt received', {
        txHash: hashToUse,
        blockNumber: receipt.blockNumber?.toString(),
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
        transactionStatus: status,
      });
    }
    
    if (receipt && status === 'confirming' && hashToUse) {
      logger.info('Transaction confirmed on-chain', {
        txHash: hashToUse,
        blockNumber: receipt.blockNumber?.toString(),
        status: receipt.status,
        timestamp: new Date().toISOString(),
      });
      
      success('Transaction confirmed!', 3000);
      setStatus('success', undefined, hashToUse);
      
      // Refresh wallet balances with polling after transaction confirmation
      // This ensures we get the updated balances even if there's a slight delay
      logger.info('Refreshing wallet balances after transaction with polling', {
        txHash: hashToUse,
        timestamp: new Date().toISOString(),
      });
      
      // Use polling to refresh balances (waits for blockchain state to update)
      refreshBalancesWithPolling({
        maxAttempts: 10, // Try up to 10 times (30 seconds total with 3s intervals)
        intervalMs: 3000, // 3 seconds between attempts
        onComplete: () => {
          logger.info('Wallet balances refreshed successfully after transaction', {
            txHash: hashToUse,
            timestamp: new Date().toISOString(),
          });
        },
      }).catch((err: unknown) => {
        logger.error('Failed to refresh wallet balances after polling', err, { txHash: hashToUse });
      });
      
      // Refresh vault data for all vaults the user has positions in (force refresh to bypass cache)
      const vaultsToRefresh = morphoHoldings.positions.map(pos => pos.vault.address);
      logger.info('Refreshing vault data after transaction', {
        txHash: hashToUse,
        vaultCount: vaultsToRefresh.length,
        vaultAddresses: vaultsToRefresh,
        timestamp: new Date().toISOString(),
      });
      
      vaultsToRefresh.forEach(vaultAddress => {
        fetchVaultData(vaultAddress, 8453, true).then(() => {
          logger.debug('Vault data refreshed', { vaultAddress, txHash: hashToUse });
        }).catch((err) => {
          logger.error('Failed to refresh vault data', err, { vaultAddress, txHash: hashToUse });
        });
      });
      
      // Also refresh all available vaults to ensure we have fresh data
      Object.values(VAULTS).forEach(vault => {
        fetchVaultData(vault.address, vault.chainId, true).catch((err) => {
          logger.error('Failed to refresh vault data', err, { vaultAddress: vault.address, txHash: hashToUse });
        });
      });
      // Don't auto-close - let user see the confirmation page with details
    } else if (receiptError && status === 'confirming' && hashToUse) {
      logger.error('Transaction receipt error', receiptError, {
        txHash: hashToUse,
        isCancellation: isCancellationError(receiptError),
      });
      
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt, receiptError, status, txHash, currentTxHash]);

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
      
      logger.info('Transaction execution started', {
        transactionType,
        fromAccount: fromAccount?.type === 'wallet' ? 'wallet' : (fromAccount as VaultAccount)?.address,
        toAccount: toAccount?.type === 'wallet' ? 'wallet' : (toAccount as VaultAccount)?.address,
        amount,
        assetSymbol: assetToUse.symbol,
        timestamp: new Date().toISOString(),
      });
      
      const onProgress = (step: TransactionProgressStep) => {
        if (step.type === 'confirming' && step.txHash) {
          logger.info('Transaction sent, waiting for confirmation', {
            txHash: step.txHash,
            timestamp: new Date().toISOString(),
          });
        }
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

