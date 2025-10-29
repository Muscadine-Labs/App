'use client';

import React, { useState, useEffect } from 'react';
import { useTransactionModal } from '../../contexts/TransactionModalContext';
import { useVaultTransactions } from '../../hooks/useVaultTransactions';
import { useWaitForTransactionReceipt } from 'wagmi';
import { CloseIcon, MoneyInIcon, MoneyOutIcon } from '../ui';
import Image from 'next/image';
import { getVaultLogo } from '../../types/vault';

export function TransactionModal() {
  const { 
    modalState, 
    closeTransactionModal, 
    updateTransactionStatus, 
    setTransactionAmount, 
    moveToNextStep 
  } = useTransactionModal();
  
  const { withdrawAll, withdrawAssets, approveTokens, executeDeposit, checkApprovalNeeded, isLoading } = useVaultTransactions();
  const [amount, setAmount] = useState(modalState.amount || '1.0');
  const [currentTxHash, setCurrentTxHash] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<{
    needsApproval: boolean;
    currentAllowance: string;
    requiredAmount: string;
  } | null>(null);

  // Wait for transaction receipt when we have a transaction hash
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({
    hash: currentTxHash as `0x${string}`,
    query: {
      enabled: !!currentTxHash && modalState.status === 'confirming',
    },
  });

  // Update local amount when modal state changes
  useEffect(() => {
    if (modalState.amount) {
      setAmount(modalState.amount);
    }
  }, [modalState.amount]);

  // Check approval status when modal opens for deposit
  useEffect(() => {
    if (modalState.isOpen && modalState.type === 'deposit' && modalState.vaultAddress && amount) {
      const checkStatus = async () => {
        try {
          const status = await checkApprovalNeeded(modalState.vaultAddress!, amount);
          setApprovalStatus(status);
        } catch (error) {
          console.error('Failed to check approval status:', error);
        }
      };
      
      checkStatus();
    }
  }, [modalState.isOpen, modalState.type, modalState.vaultAddress, amount, checkApprovalNeeded]);

  // Handle transaction receipt
  useEffect(() => {
    if (receipt && modalState.status === 'confirming') {
      console.log('Transaction receipt received:', receipt);
      
      // If we're in authorize step, move to deposit step
      if (modalState.step === 'authorize' && modalState.type === 'deposit') {
        console.log('Authorization complete, moving to deposit step');
        moveToNextStep();
        setCurrentTxHash(null); // Clear hash for next transaction
      } else {
        // Final transaction complete
        updateTransactionStatus('success', undefined, currentTxHash || undefined);
        
        // Auto-close after success
        setTimeout(() => {
          closeTransactionModal();
        }, 3000);
      }
    } else if (receiptError && modalState.status === 'confirming') {
      console.log('Transaction receipt error:', receiptError);
      updateTransactionStatus('error', 'Transaction failed or was reverted');
    }
  }, [receipt, receiptError, modalState.status, currentTxHash, updateTransactionStatus, closeTransactionModal, modalState.step, modalState.type, moveToNextStep]);

  // Handle wallet interaction timeout (only for very long delays)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (modalState.status === 'depositing' && !modalState.isPageVisible) {
      // Set a longer timeout for wallet interaction (60 seconds) - only for extreme cases
      timeoutId = setTimeout(() => {
        console.log('Wallet interaction timeout - transaction taking too long');
        updateTransactionStatus('error', 'Transaction timed out. Please try again.');
      }, 60000); // Increased to 60 seconds
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [modalState.status, modalState.isPageVisible, updateTransactionStatus]);

  // Handle amount input changes
  const handleAmountChange = (value: string) => {
    setAmount(value);
    setTransactionAmount(value);
  };

  // Execute transaction based on type
  const executeTransaction = async () => {
    if (!modalState.vaultAddress) return;

    try {
      console.log('Starting transaction:', modalState.type);
      
      let txHash: string;
      
      switch (modalState.type) {
        case 'deposit':
          if (modalState.step === 'authorize') {
            if (approvalStatus?.needsApproval) {
              // Step 1: Approve tokens
              updateTransactionStatus('authorizing');
              console.log('Calling approveTokens function...');
              txHash = await approveTokens(modalState.vaultAddress, amount);
              console.log('Approval completed, txHash:', txHash);
              setCurrentTxHash(txHash);
              updateTransactionStatus('confirming', undefined, txHash);
            } else {
              // Show authorization complete and move to next step
              console.log('Authorization already complete, moving to deposit step');
              updateTransactionStatus('authorized');
              setTimeout(() => {
                moveToNextStep();
              }, 1500);
              return;
            }
          } else {
            // Step 2: Execute deposit
            updateTransactionStatus('depositing');
            console.log('Calling executeDeposit function...');
            txHash = await executeDeposit(modalState.vaultAddress, amount);
            console.log('Deposit completed, txHash:', txHash);
            setCurrentTxHash(txHash);
            updateTransactionStatus('confirming', undefined, txHash);
          }
          break;
          
        case 'withdraw':
          updateTransactionStatus('depositing'); // Reuse status for withdrawal
          console.log('Calling withdrawAll function...');
          txHash = await withdrawAll(modalState.vaultAddress);
          console.log('Withdraw completed, txHash:', txHash);
          setCurrentTxHash(txHash);
          updateTransactionStatus('confirming', undefined, txHash);
          break;
          
        case 'withdrawAll':
          updateTransactionStatus('depositing'); // Reuse status for withdrawal
          console.log('Calling withdrawAssets function...');
          txHash = await withdrawAssets(modalState.vaultAddress, amount);
          console.log('Withdraw completed, txHash:', txHash);
          setCurrentTxHash(txHash);
          updateTransactionStatus('confirming', undefined, txHash);
          break;
          
        default:
          throw new Error('Invalid transaction type');
      }
    } catch (err) {
      console.error('Transaction failed with error:', err);
      console.error('Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        name: err instanceof Error ? err.name : 'Unknown',
        stack: err instanceof Error ? err.stack : 'No stack trace',
        type: typeof err,
        constructor: err?.constructor?.name,
        toString: err?.toString?.()
      });
      
      let errorMessage = 'Transaction failed';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      updateTransactionStatus('error', errorMessage);
    }
  };

  // Handle modal close
  const handleClose = () => {
    if (modalState.status === 'authorizing' || modalState.status === 'depositing' || modalState.status === 'confirming') {
      return; // Don't allow closing during transaction
    }
    closeTransactionModal();
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!modalState.isOpen) {
    return null;
  }

  const getStatusIcon = () => {
    switch (modalState.status) {
      case 'authorizing':
      case 'depositing':
      case 'confirming':
        return (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
        );
      case 'authorized':
        return (
          <div className="w-8 h-8 rounded-full bg-[var(--success)] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'success':
        return (
          <div className="w-8 h-8 rounded-full bg-[var(--success)] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="w-8 h-8 rounded-full bg-[var(--danger)] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    switch (modalState.status) {
      case 'authorizing':
        return 'Authorizing token spend...';
      case 'authorized':
        return 'Authorization complete!';
      case 'depositing':
        return modalState.type === 'deposit' ? 'Executing deposit...' : 'Executing withdrawal...';
      case 'confirming':
        return 'Transaction submitted, waiting for confirmation...';
      case 'success':
        return 'Transaction successful!';
      case 'error':
        return modalState.error || 'Transaction failed';
      default:
        return '';
    }
  };

  const getActionButtonText = () => {
    if (modalState.type === 'deposit') {
      if (modalState.step === 'authorize') {
        return approvalStatus?.needsApproval ? 'Authorize Tokens' : 'Continue';
      } else {
        return 'Deposit';
      }
    }
    
    switch (modalState.type) {
      case 'withdraw':
      case 'withdrawAll':
        return 'Withdraw';
      default:
        return 'Confirm';
    }
  };

  const isTransactionInProgress = modalState.status === 'authorizing' || modalState.status === 'depositing' || modalState.status === 'confirming';
  const canClose = !isTransactionInProgress;
  const isWalletInteraction = !modalState.isPageVisible && isTransactionInProgress;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'var(--overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Wallet Interaction Indicator */}
        {isWalletInteraction && (
          <div className="bg-[var(--warning-subtle)] border-b border-[var(--warning)] p-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-[var(--warning)] rounded-full animate-pulse"></div>
              <p className="text-sm text-[var(--warning)] font-medium">
                Wallet interaction in progress. Please complete the transaction in your wallet.
              </p>
            </div>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              You can navigate away from this page - the transaction will continue in your wallet.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden">
              <Image 
                src={getVaultLogo(modalState.vaultSymbol || '')} 
                alt={`${modalState.vaultSymbol} logo`}
                width={40}
                height={40}
                className={`w-full h-full object-contain ${
                  modalState.vaultSymbol === 'WETH' ? 'scale-75' : ''
                }`}
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                {modalState.type === 'deposit' ? 'Deposit' : 'Withdraw'}
              </h2>
              <p className="text-sm text-[var(--foreground-secondary)]">
                {modalState.vaultName}
              </p>
            </div>
          </div>
          
          {canClose && (
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <CloseIcon size="sm" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status Display */}
          {(modalState.status !== 'idle') && (
            <div className="flex items-center justify-center gap-3 mb-6 p-4 bg-[var(--surface)] rounded-lg">
              {getStatusIcon()}
              <p className="text-sm font-medium text-[var(--foreground)]">
                {getStatusMessage()}
              </p>
            </div>
          )}

          {/* Amount Input (only show when not in progress) */}
          {modalState.status === 'idle' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-2">
                Amount
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.0"
                  className="w-full px-4 py-3 pr-16 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                  style={{
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield'
                  }}
                  step="0.000001"
                  min="0"
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-[var(--foreground-secondary)]">
                  {modalState.vaultSymbol}
                </div>
              </div>
            </div>
          )}

          {/* Transaction Hash Display */}
          {currentTxHash && (
            <div className="mb-6 p-4 bg-[var(--surface)] rounded-lg">
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Transaction Hash</p>
              <p className="text-sm font-figtree text-[var(--foreground)] break-all">
                {currentTxHash}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {canClose && (
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--foreground)] font-medium rounded-lg transition-colors border border-[var(--border-subtle)]"
              >
                {modalState.status === 'error' ? 'Close' : 'Cancel'}
              </button>
            )}
            
            {modalState.status === 'idle' && (
              <button
                onClick={executeTransaction}
                disabled={!amount || parseFloat(amount) <= 0 || isLoading}
                className={`flex-1 px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  modalState.type === 'deposit'
                    ? 'bg-[var(--success)] hover:bg-[var(--success-hover)] text-white'
                    : 'bg-[var(--warning)] hover:bg-[var(--warning-hover)] text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading ? (
                  'Processing...'
                ) : (
                  <>
                    
                    {getActionButtonText()}
                  </>
                )}
              </button>
            )}

            {modalState.status === 'error' && (
              <button
                onClick={executeTransaction}
                disabled={isLoading}
                className={`flex-1 px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  modalState.type === 'deposit'
                    ? 'bg-[var(--success)] hover:bg-[var(--success-hover)] text-white'
                    : 'bg-[var(--warning)] hover:bg-[var(--warning-hover)] text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading ? (
                  'Retrying...'
                ) : (
                  <>
                    {modalState.type === 'deposit' ? (
                      <MoneyInIcon size="sm" />
                    ) : (
                      <MoneyOutIcon size="sm" />
                    )}
                    Retry
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}