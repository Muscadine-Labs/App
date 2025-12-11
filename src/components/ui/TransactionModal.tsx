'use client';

import React, { useState, useEffect } from 'react';
import { useTransactionModal } from '../../contexts/TransactionModalContext';
import { useVaultTransactions, type TransactionProgressStep } from '../../hooks/useVaultTransactions';
import { useWaitForTransactionReceipt } from 'wagmi';
import { useWallet } from '../../contexts/WalletContext';
import { useVaultData } from '../../contexts/VaultDataContext';
import { CloseIcon } from '.';
import Image from 'next/image';
import { getVaultLogo } from '../../types/vault';
import { formatSmartCurrency } from '../../lib/formatter';
import { logger } from '../../lib/logger';

// Helper function to check if an error is a user cancellation
function isCancellationError(error: unknown): boolean {
  if (!error) return false;
  
  const errorString = error instanceof Error ? error.message : String(error);
  const errorLower = errorString.toLowerCase();

  return (
    errorLower.includes('user rejected') ||
    errorLower.includes('user cancelled') ||
    errorLower.includes('rejected') ||
    errorLower.includes('denied') ||
    errorLower.includes('action_cancelled') ||
    errorLower.includes('4001') ||
    errorLower.includes('user denied') ||
    errorLower.includes('user rejected the request') ||
    errorLower.includes('user rejected transaction')
  );
}

// Helper function to convert technical errors into user-friendly messages
function formatTransactionError(error: unknown): string {
  if (!error) {
    return 'Transaction failed. Please try again.';
  }

  const errorString = error instanceof Error ? error.message : String(error);
  const errorLower = errorString.toLowerCase();

  // User rejection / cancellation (should be handled separately, but keep for fallback)
  if (isCancellationError(error)) {
    return 'Transaction cancelled.';
  }

  // Insufficient balance
  if (
    errorLower.includes('insufficient') ||
    errorLower.includes('balance too low') ||
    errorLower.includes('execution reverted: insufficient')
  ) {
    return 'Insufficient balance. Please check your available funds.';
  }

  // Transaction reverted
  if (
    errorLower.includes('reverted') ||
    errorLower.includes('execution reverted') ||
    errorLower.includes('revert')
  ) {
    return 'Transaction was reverted. Please try again with a different amount or check your balance.';
  }

  // Network / RPC errors
  if (
    errorLower.includes('network') ||
    errorLower.includes('rpc') ||
    errorLower.includes('fetch') ||
    errorLower.includes('timeout') ||
    errorLower.includes('connection')
  ) {
    return 'Network error. Please check your connection and try again.';
  }

  // Gas / fee errors
  if (
    errorLower.includes('gas') ||
    errorLower.includes('fee') ||
    errorLower.includes('out of gas')
  ) {
    return 'Transaction failed due to gas estimation. Please try again.';
  }

  // Simulation state errors
  if (
    errorLower.includes('simulation') ||
    errorLower.includes('bundler') ||
    errorLower.includes('not ready')
  ) {
    return 'System is preparing the transaction. Please wait a moment and try again.';
  }

  // Generic transaction failure
  if (
    errorLower.includes('transaction failed') ||
    errorLower.includes('failed')
  ) {
    return 'Transaction failed. Please try again.';
  }

  // If it's a short, readable error, use it directly
  if (errorString.length < 100 && !errorString.includes('Error: ')) {
    return errorString;
  }

  // Default fallback for long technical errors
  return 'Transaction failed. Please try again.';
}

export function TransactionModal() {
  const { 
    modalState, 
    closeTransactionModal, 
    updateTransactionStatus
  } = useTransactionModal();
  
  const { 
    executeVaultAction,
    isLoading 
  } = useVaultTransactions(modalState.vaultAddress || undefined);
  
  const { morphoHoldings } = useWallet();
  const vaultDataContext = useVaultData();
  
  const [currentTxHash, setCurrentTxHash] = useState<string | null>(null);
  const [prerequisiteReceipts, setPrerequisiteReceipts] = useState<Map<number, boolean>>(new Map());
  const [assetPrice, setAssetPrice] = useState<number | null>(null);
  const [stepsInfo, setStepsInfo] = useState<Array<{ stepIndex: number; label: string; type: 'signing' | 'approving' | 'confirming'; txHash?: string }>>([]);
  const [totalSteps, setTotalSteps] = useState<number>(0);

  // Reset transaction hash and step when modal opens (preview status) or closes
  useEffect(() => {
    if (!modalState.isOpen) {
      // Clear hash and step when modal closes
      setCurrentTxHash(null);
      setPrerequisiteReceipts(new Map());
      setStepsInfo([]);
      setTotalSteps(0);
    } else if (modalState.status === 'preview') {
      // Clear hash and step when modal opens in preview state (starting new transaction)
      // The amount is already properly reset by openTransactionModal in the context
      setCurrentTxHash(null);
      setPrerequisiteReceipts(new Map());
      setStepsInfo([]);
      setTotalSteps(0);
    }
  }, [modalState.status, modalState.isOpen]);

  // Get vault data
  const vaultData = modalState.vaultAddress ? vaultDataContext.getVaultData(modalState.vaultAddress) : null;

  // Get current position
  const currentVaultPosition = modalState.vaultAddress
    ? morphoHoldings.positions.find(
        pos => pos.vault.address.toLowerCase() === modalState.vaultAddress!.toLowerCase()
      )
    : null;

  const userVaultValueUsd = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18) * currentVaultPosition.vault.state.sharePriceUsd : 0;

  // Parse amount - handle string, number, or null
  const amountStr = modalState.amount?.toString().trim() || '';
  let amount = 0;
  if (amountStr) {
    const parsed = parseFloat(amountStr);
    amount = isNaN(parsed) ? 0 : parsed;
  }

  // Calculate asset price from vault state for consistency with vault's internal pricing
  // This ensures USD values match between amount display and balance calculations
  // Formula: assetPrice = sharePriceUsd / (totalAssets / totalSupply)
  let vaultAssetPrice: number | null = null;
  
  // Try to get from current position first (most accurate, includes user's vault state)
  if (currentVaultPosition && vaultData?.totalAssets && currentVaultPosition.vault.state.totalSupply) {
    const totalAssets = parseFloat(vaultData.totalAssets) / Math.pow(10, vaultData.assetDecimals ?? 18);
    const totalSupply = parseFloat(currentVaultPosition.vault.state.totalSupply) / 1e18;
    const sharePriceInAssets = totalSupply > 0 ? totalAssets / totalSupply : 0;
    const sharePriceUsd = currentVaultPosition.vault.state.sharePriceUsd;
    
    if (sharePriceInAssets > 0 && sharePriceUsd > 0) {
      vaultAssetPrice = sharePriceUsd / sharePriceInAssets;
    }
  }
  
  // Use vault's calculated asset price if available, otherwise fall back to external price API
  // This ensures consistency: both amountUsd and userVaultValueUsd use the same pricing source
  const effectiveAssetPrice = vaultAssetPrice || assetPrice;
  const amountUsd = effectiveAssetPrice && amount > 0 ? amount * effectiveAssetPrice : 0;


  // Calculate balance after transaction
  const balanceBefore = userVaultValueUsd;
  let balanceAfter = userVaultValueUsd;
  if (modalState.type === 'deposit') {
    balanceAfter = userVaultValueUsd + amountUsd;
  } else if (modalState.type === 'withdraw' || modalState.type === 'withdrawAll') {
    balanceAfter = Math.max(0, userVaultValueUsd - amountUsd);
  }

  // Fetch asset price
  useEffect(() => {
    if (!modalState.vaultSymbol) return;
    
    const fetchAssetPrice = async () => {
      const vaultSymbol = modalState.vaultSymbol!.toUpperCase();
      
      // For stablecoins, always use exactly 1.0 (don't fetch from API)
      if (vaultSymbol === 'USDC' || vaultSymbol === 'USDT' || vaultSymbol === 'DAI') {
        setAssetPrice(1);
        return;
      }
      
      try {
        const symbolMap: Record<string, string> = {
          'cbBTC': 'BTC',
          'CBBTC': 'BTC',
          'CBTC': 'BTC',
          'WETH': 'ETH',
          'WBTC': 'BTC',
        };
        
        const priceSymbol = symbolMap[vaultSymbol] || vaultSymbol;
        
        const response = await fetch(`/api/prices?symbols=${priceSymbol}`);
        if (response.ok) {
          const data = await response.json();
          const priceKey = priceSymbol.toLowerCase();
          const price = data[priceKey];
          
          if (price && typeof price === 'number' && price > 0) {
            setAssetPrice(price);
          }
        }
      } catch {
        // Failed to fetch price - will use null
        setAssetPrice(null);
      }
    };

    fetchAssetPrice();
  }, [modalState.vaultSymbol]);

  // Wait for main transaction receipt (deposit/withdraw)
  // Use currentTxHash state if available, otherwise fall back to modalState.txHash
  // This ensures we start waiting as soon as we have a hash
  const txHashToWaitFor = currentTxHash || modalState.txHash;
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHashToWaitFor as `0x${string}`,
    query: {
      enabled: !!txHashToWaitFor && modalState.status === 'confirming' && modalState.isOpen,
    },
  });

  // Wait for prerequisite transaction receipts - track the current one being processed
  const currentPrerequisiteStep = stepsInfo.find(step => 
    (step.type === 'signing' || step.type === 'approving') && 
    step.txHash && 
    !prerequisiteReceipts.get(step.stepIndex)
  );
  
  const { data: prerequisiteReceipt, error: prerequisiteReceiptError } = useWaitForTransactionReceipt({
    hash: currentPrerequisiteStep?.txHash as `0x${string}`,
    query: {
      enabled: !!currentPrerequisiteStep?.txHash && 
              (modalState.status === 'approving' || modalState.status === 'signing') && 
              modalState.isOpen,
    },
  });

  // Handle prerequisite transaction receipts
  useEffect(() => {
    if (prerequisiteReceipt && currentPrerequisiteStep) {
      // Mark this prerequisite step as completed
      setPrerequisiteReceipts(prev => new Map(prev).set(currentPrerequisiteStep.stepIndex, true));
    } else if (prerequisiteReceiptError && currentPrerequisiteStep) {
      // Check if prerequisite error is a cancellation
      if (isCancellationError(prerequisiteReceiptError)) {
        // Keep modal open and reset to preview state
        updateTransactionStatus('preview');
        setCurrentTxHash(null);
        setPrerequisiteReceipts(new Map());
        setStepsInfo([]);
        setTotalSteps(0);
      } else {
        updateTransactionStatus('error', formatTransactionError(prerequisiteReceiptError));
      }
    }
  }, [prerequisiteReceipt, prerequisiteReceiptError, currentPrerequisiteStep, updateTransactionStatus]);

  // Handle transaction receipt - only mark as success when receipt is confirmed
  useEffect(() => {
    // Only process receipt when status is confirming and we have a receipt
    const hashToUse = currentTxHash || modalState.txHash;
    if (receipt && modalState.status === 'confirming' && hashToUse) {
      updateTransactionStatus('success', undefined, hashToUse);
      setTimeout(() => {
        closeTransactionModal();
      }, 3000);
    } else if (receiptError && modalState.status === 'confirming' && hashToUse) {
      // Check if receipt error is a cancellation
      if (isCancellationError(receiptError)) {
        // Keep modal open and reset to preview state
        updateTransactionStatus('preview');
        setCurrentTxHash(null);
        setPrerequisiteReceipts(new Map());
        setStepsInfo([]);
        setTotalSteps(0);
      } else {
        updateTransactionStatus('error', formatTransactionError(receiptError));
      }
    }
  }, [receipt, receiptError, modalState.status, modalState.txHash, currentTxHash, updateTransactionStatus, closeTransactionModal]);

  // Execute transaction with retry logic for allowance errors
  const handleConfirm = async () => {
    if (!modalState.vaultAddress || !modalState.amount) return;

    try {
      updateTransactionStatus('confirming');
      
      let retryCount = 0;
      const maxRetries = 1;

      const executeWithRetry = async (): Promise<string> => {
        try {
          // Progress callback to track transaction steps
          const onProgress = (step: TransactionProgressStep) => {
            // Store total steps for building the full steps array
            setTotalSteps(step.totalSteps);
            
            // Update steps info with the current step
            setStepsInfo(prev => {
              const newSteps = [...prev];
              const existingIndex = newSteps.findIndex(s => s.stepIndex === step.stepIndex);
              const stepInfo = {
                stepIndex: step.stepIndex,
                label: step.stepLabel || (step.type === 'signing' ? 'Sign' : step.type === 'approving' ? 'Approve' : 'Confirm'),
                type: step.type,
                txHash: step.type === 'confirming' ? step.txHash : (step.type === 'approving' ? step.txHash : undefined)
              };
              
              if (existingIndex >= 0) {
                newSteps[existingIndex] = stepInfo;
              } else {
                // Ensure array is large enough
                while (newSteps.length <= step.stepIndex) {
                  newSteps.push({ stepIndex: newSteps.length, label: '', type: 'confirming' });
                }
                newSteps[step.stepIndex] = stepInfo;
              }
              
              return newSteps;
            });
            
            // Update status based on step type
            if (step.type === 'signing') {
              updateTransactionStatus('signing');
            } else if (step.type === 'approving') {
              updateTransactionStatus('approving');
            } else if (step.type === 'confirming') {
              // CRITICAL: Set currentTxHash immediately when we get the transaction hash
              // This ensures useWaitForTransactionReceipt can start waiting right away
              if (step.txHash) {
                setCurrentTxHash(step.txHash);
              }
              updateTransactionStatus('confirming', undefined, step.txHash);
            }
          };

          if (modalState.type === 'deposit') {
            return await executeVaultAction('deposit', modalState.vaultAddress!, modalState.amount!, onProgress);
          } else if (modalState.type === 'withdraw') {
            // If amount is specified, withdraw that amount, otherwise withdraw all
            if (modalState.amount && parseFloat(modalState.amount) > 0) {
              return await executeVaultAction('withdraw', modalState.vaultAddress!, modalState.amount, onProgress);
            } else {
              return await executeVaultAction('withdrawAll', modalState.vaultAddress!, undefined, onProgress);
            }
          } else if (modalState.type === 'withdrawAll') {
            return await executeVaultAction('withdrawAll', modalState.vaultAddress!, undefined, onProgress);
          } else {
            throw new Error('Invalid transaction type');
          }
        } catch (err: unknown) {
          const errorString = err instanceof Error ? err.message : String(err);
          const errorLower = errorString.toLowerCase();
          const isAllowanceError = errorLower.includes('allowance') || 
                                   errorLower.includes('transfer amount exceeds');
          
          // If we get an allowance error and haven't retried yet, wait and retry
          if (isAllowanceError && retryCount < maxRetries) {
            retryCount++;
            // Wait a moment for simulation state to update after approval
            await new Promise(resolve => setTimeout(resolve, 2000));
            return executeWithRetry();
          }
          throw err;
        }
      };

      const txHash = await executeWithRetry();
      // Note: currentTxHash is already set in onProgress callback when step.txHash is available
      // This is a fallback in case the hash wasn't set via callback
      if (!currentTxHash && txHash) {
        setCurrentTxHash(txHash);
      }
      // Status is already updated by onProgress callback

    } catch (err) {
      // Check if this is a cancellation - handle separately
      if (isCancellationError(err)) {
        // Keep modal open and reset to preview state
        updateTransactionStatus('preview');
        setCurrentTxHash(null);
        setPrerequisiteReceipts(new Map());
        setStepsInfo([]);
        setTotalSteps(0);
        return;
      }
      
      // Format error message for user display
      const errorMessage = formatTransactionError(err);
      
      // Log error details
      logger.error('Transaction error', err instanceof Error ? err : new Error(String(err)), {
        message: errorMessage,
        vaultAddress: modalState.vaultAddress,
        transactionType: modalState.type,
      });
      
      updateTransactionStatus('error', errorMessage);
    }
  };


  if (!modalState.isOpen) {
    return null;
  }

  const isSigning = modalState.status === 'signing';
  const isApproving = modalState.status === 'approving';
  const isConfirming = modalState.status === 'confirming';
  const isSuccess = modalState.status === 'success';
  const isError = modalState.status === 'error';

  // Determine steps for status bar dynamically based on stepsInfo
  // Show steps when transaction is in progress or completed
  const steps = (isSigning || isApproving || isConfirming || isSuccess) ? (() => {
    // Use totalSteps if available, otherwise calculate from stepsInfo
    const effectiveTotalSteps = totalSteps > 0 ? totalSteps : (stepsInfo.length > 0 ? Math.max(...stepsInfo.map(s => s.stepIndex)) + 1 : 0);
    
    // If we have totalSteps or stepsInfo, use it to build the steps dynamically
    if (effectiveTotalSteps > 0) {
      const stepArray: Array<{ label: string; completed: boolean; active: boolean }> = [];
      
      // Build steps array for all steps (even if not all are in stepsInfo yet)
      for (let i = 0; i < effectiveTotalSteps; i++) {
        const stepInfo = stepsInfo.find(s => s.stepIndex === i);
        const isCompleted = stepInfo 
          ? (stepInfo.type === 'confirming' 
              ? !!receipt 
              : !!prerequisiteReceipts.get(i))
          : false;
        const isActive = stepInfo 
          ? ((stepInfo.type === 'signing' && isSigning) ||
             (stepInfo.type === 'approving' && isApproving) ||
             (stepInfo.type === 'confirming' && isConfirming)) && !isCompleted
          : false;
        
        // Default label based on step index if we don't have stepInfo yet
        let label = stepInfo?.label;
        if (!label) {
          // If we're past approval steps and haven't seen confirm yet, it's likely the confirm step
          const approvalSteps = stepsInfo.filter(s => s.type === 'approving').length;
          if (i === approvalSteps && !stepInfo) {
            label = 'Confirm';
          } else {
            label = `Step ${i + 1}`;
          }
        }
        
        stepArray.push({
          label,
          completed: isCompleted || (isSuccess && i < effectiveTotalSteps),
          active: isActive
        });
      }
      
      return stepArray;
    }
    
    // Fallback: if transaction is successful but we don't have stepsInfo, show generic steps
    if (isSuccess) {
      return [
        { label: 'Confirm', completed: true, active: false }
      ];
    }
    
    // Fallback: show generic steps if we don't have step info yet
    return [
      { label: 'Approve', completed: false, active: isApproving },
      { label: 'Confirm', completed: false, active: isConfirming }
    ];
  })() : [];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'var(--overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div 
        className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            {modalState.status === 'preview' ? 'Review' : 'Confirm'}
          </h2>
          {!isSigning && !isApproving && !isConfirming && (
            <button
              onClick={closeTransactionModal}
              className="w-8 h-8 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <CloseIcon size="sm" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isSuccess && (
            <div className="flex items-center gap-3 p-4 bg-[var(--success-subtle)] rounded-lg border border-[var(--success)]">
              <div className="w-8 h-8 rounded-full bg-[var(--success)] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Transaction confirmed!
                </p>
                {currentTxHash && (
                  <a
                    href={`https://basescan.org/tx/${currentTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors mt-1 inline-flex items-center gap-1"
                  >
                    <span className="font-mono">{`${currentTxHash.slice(0, 6)}...${currentTxHash.slice(-4)}`}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {isError && (
            <>
              <div className="flex items-center gap-3 p-4 bg-[var(--danger-subtle)] rounded-lg border border-[var(--danger)]">
                <div className="w-8 h-8 rounded-full bg-[var(--danger)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {modalState.error || 'Transaction failed'}
                </p>
              </div>
              <button
                onClick={() => {
                  updateTransactionStatus('preview');
                  setCurrentTxHash(null);
                  setPrerequisiteReceipts(new Map());
                  setStepsInfo([]);
                  setTotalSteps(0);
                }}
                className="w-full px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--foreground)] font-medium rounded-lg transition-colors text-sm"
              >
                Try Again
              </button>
            </>
          )}

          {/* Transaction Info - Show in preview, during transaction execution, and on success */}
          {(modalState.status === 'preview' || isSigning || isApproving || isConfirming || isSuccess || isError) && (
            <>
              {/* Vault Info */}
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
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">
                    {modalState.vaultName}
                  </h3>
                </div>
              </div>

              {/* Transaction Type and Amount */}
              <div className="space-y-2">
                <p className="text-sm text-[var(--foreground-secondary)]">
                  {modalState.type === 'deposit' ? 'Deposit' : 'Withdraw'}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold text-[var(--foreground)]">
                      {modalState.amount || '0'} {modalState.vaultSymbol}
                    </span>
                    {amountUsd > 0 && (
                      <span className="text-base text-[var(--foreground-secondary)] bg-[var(--surface)] px-2 py-1 rounded">
                        {formatSmartCurrency(amountUsd)}
                      </span>
                    )}
                  </div>
                  {modalState.vaultSymbol && (
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden">
                      <Image
                        src={getVaultLogo(modalState.vaultSymbol)}
                        alt={`${modalState.vaultSymbol} logo`}
                        width={32}
                        height={32}
                        className={`w-full h-full object-contain ${
                          modalState.vaultSymbol === 'WETH' ? 'scale-75' : ''
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Balance Change */}
              <div className="bg-[var(--surface)] rounded-lg p-4 space-y-2">
                <p className="text-sm text-[var(--foreground-secondary)]">
                  {modalState.type === 'deposit' ? 'Deposit' : 'Withdraw'} ({modalState.vaultSymbol})
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-[var(--foreground)]">
                    {formatSmartCurrency(balanceBefore)}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 text-[var(--foreground-secondary)]"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                  <span className="text-lg font-semibold text-[var(--foreground)]">
                    {formatSmartCurrency(balanceAfter)}
                  </span>
                </div>
              </div>

              {/* Warning for WETH deposits */}
              {modalState.type === 'deposit' && modalState.vaultSymbol?.toUpperCase() === 'WETH' && (
                <div className="flex items-start gap-3 p-4 bg-[var(--warning-subtle)] rounded-lg border border-[var(--warning)]">
                  <div className="w-5 h-5 rounded-full bg-[var(--warning)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-sm text-[var(--foreground)]">
                    <span className="font-medium">Warning:</span> Depositing all your available ETH may leave insufficient funds for gas fees, which could prevent you from executing future transactions.
                  </p>
                </div>
              )}

              {/* Disclaimer - Only show in preview */}
              {modalState.status === 'preview' && (
                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <p className="text-xs text-[var(--foreground-secondary)] leading-relaxed">
                    By confirming this transaction, you agree to the{' '}
                    <a 
                      href="#"
                      className="text-[var(--primary)] hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        // Open terms of use
                      }}
                    >
                      Terms of Use
                    </a>
                    {' '}and the services provisions relating to the Morpho Vault.
                  </p>
                </div>
              )}

              {/* Transaction Link - Only show as subtle link during confirming, hidden during success */}
              {(isSigning || isApproving || isConfirming) && currentTxHash && !isSuccess && (
                <div className="pt-2">
                  <a
                    href={`https://basescan.org/tx/${currentTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
                  >
                    <span className="font-mono">{`${currentTxHash.slice(0, 6)}...${currentTxHash.slice(-4)}`}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              )}

              {/* Error Transaction Info */}
              {isError && stepsInfo.length > 0 && (
                <div className="pt-4 border-t border-[var(--danger)]">
                  <p className="text-sm text-[var(--danger)]">
                    Transaction {stepsInfo.findIndex(s => s.type === 'confirming' || s.type === 'approving' || s.type === 'signing') + 1}/{stepsInfo.length} - An error occurred
                  </p>
                </div>
              )}

              {/* Confirm Button - Only show in preview */}
              {modalState.status === 'preview' && (
                <button
                  onClick={handleConfirm}
                  disabled={isLoading || !modalState.amount || amount <= 0}
                  className="w-full px-4 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Processing...' : 'Confirm'}
                </button>
              )}

              {/* Status Bar - Replace confirm button during signing/approving/confirming/success */}
              {(isSigning || isApproving || isConfirming || isSuccess) && steps.length > 0 && (
                <div className="space-y-3">
                  {/* Step Labels */}
                  <div className="flex items-center justify-between">
                    {steps.map((step, index) => (
                      <div key={index} className="flex flex-col items-center flex-1">
                        <span className={`text-xs font-medium ${
                          step.active || step.completed
                            ? 'text-[var(--foreground)]'
                            : 'text-[var(--foreground-secondary)]'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Continuous Progress Bar */}
                  <div className="relative h-2 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                    {/* Completed segments */}
                    {steps.map((step, index) => {
                      const segmentWidth = 100 / steps.length;
                      const isSegmentCompleted = step.completed;
                      const isSegmentActive = step.active && !step.completed;
                      
                      return (
                        <div
                          key={index}
                          className="absolute h-full transition-all duration-300"
                          style={{
                            left: `${index * segmentWidth}%`,
                            width: `${segmentWidth}%`,
                            backgroundColor: isSegmentCompleted 
                              ? 'var(--success)' 
                              : isSegmentActive 
                              ? 'var(--primary)' 
                              : 'transparent',
                          }}
                        >
                          {/* Break line between segments (except for last segment) */}
                          {index < steps.length - 1 && (
                            <div 
                              className="absolute right-0 top-0 w-px h-full bg-[var(--background)] z-10"
                              style={{ marginRight: '-1px' }}
                            />
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Active segment animation - only show when not in success state */}
                    {!isSuccess && steps.some(step => step.active && !step.completed) && (
                      <div 
                        className="absolute h-full bg-[var(--primary)] opacity-50 animate-pulse"
                        style={{
                          width: `${(steps.findIndex(step => step.active && !step.completed) + 1) * (100 / steps.length)}%`,
                        }}
                      />
                    )}
                    
                    {/* Success state - show full green bar */}
                    {isSuccess && (
                      <div 
                        className="absolute h-full bg-[var(--success)] transition-all duration-300 z-20"
                        style={{
                          width: '100%',
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
