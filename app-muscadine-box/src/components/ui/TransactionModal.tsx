'use client';

import React, { useState, useEffect } from 'react';
import { useTransactionModal } from '../../contexts/TransactionModalContext';
import { useVaultTransactions } from '../../hooks/useVaultTransactions';
import { useWaitForTransactionReceipt } from 'wagmi';
import { useWallet } from '../../contexts/WalletContext';
import { useVaultData } from '../../contexts/VaultDataContext';
import { CloseIcon } from '../ui';
import Image from 'next/image';
import { getVaultLogo } from '../../types/vault';
import { formatSmartCurrency, formatAssetAmountSafe, formatAssetAmountForInput, getTokenDisplayPrecision } from '../../lib/formatter';

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
  const [assetPrice, setAssetPrice] = useState<number | null>(null);

  // Reset transaction hash when modal opens (preview status) or closes
  useEffect(() => {
    if (!modalState.isOpen) {
      // Clear hash when modal closes
      setCurrentTxHash(null);
    } else if (modalState.status === 'preview') {
      // Clear hash when modal opens in preview state (starting new transaction)
      setCurrentTxHash(null);
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
  // Trim whitespace and ensure it's a valid number
  const amountStr = modalState.amount?.toString().trim() || '';
  let amount = 0;
  if (amountStr) {
    const parsed = parseFloat(amountStr);
    amount = isNaN(parsed) ? 0 : parsed;
  }
  const amountUsd = assetPrice && amount > 0 ? amount * assetPrice : 0;


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
      try {
        const symbolMap: Record<string, string> = {
          'cbBTC': 'BTC',
          'CBBTC': 'BTC',
          'CBTC': 'BTC',
          'WETH': 'ETH',
          'WBTC': 'BTC',
        };
        
        const vaultSymbol = modalState.vaultSymbol!.toUpperCase();
        const priceSymbol = symbolMap[vaultSymbol] || vaultSymbol;
        
        const response = await fetch(`/api/prices?symbols=${priceSymbol}`);
        if (response.ok) {
          const data = await response.json();
          const priceKey = priceSymbol.toLowerCase();
          const price = data[priceKey];
          
          if (price && typeof price === 'number' && price > 0) {
            setAssetPrice(price);
          } else if (vaultSymbol === 'USDC' || vaultSymbol === 'USDT' || vaultSymbol === 'DAI') {
            setAssetPrice(1);
          }
        }
      } catch (error) {
        console.error('Failed to fetch asset price:', error);
        if (modalState.vaultSymbol?.toUpperCase() === 'USDC' || 
            modalState.vaultSymbol?.toUpperCase() === 'USDT' || 
            modalState.vaultSymbol?.toUpperCase() === 'DAI') {
          setAssetPrice(1);
        }
      }
    };

    fetchAssetPrice();
  }, [modalState.vaultSymbol]);

  // Wait for main transaction receipt (deposit/withdraw)
  // Only enable when we have a hash AND status is confirming (not preview or error)
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({
    hash: currentTxHash as `0x${string}`,
    query: {
      enabled: !!currentTxHash && modalState.status === 'confirming' && modalState.isOpen,
    },
  });

  // Handle transaction receipt - only mark as success when receipt is confirmed
  useEffect(() => {
    // Only process receipt when status is confirming and we have a receipt
    if (receipt && modalState.status === 'confirming' && currentTxHash) {
      updateTransactionStatus('success', undefined, currentTxHash);
      setTimeout(() => {
        closeTransactionModal();
      }, 3000);
    } else if (receiptError && modalState.status === 'confirming' && currentTxHash) {
      // Check if receipt error is a cancellation
      if (isCancellationError(receiptError)) {
        updateTransactionStatus('cancelled');
        setTimeout(() => {
          closeTransactionModal();
        }, 1500);
      } else {
        updateTransactionStatus('error', formatTransactionError(receiptError));
      }
    }
  }, [receipt, receiptError, modalState.status, currentTxHash, updateTransactionStatus, closeTransactionModal]);

  // Execute transaction with retry logic for allowance errors
  const handleConfirm = async () => {
    if (!modalState.vaultAddress || !modalState.amount) return;

    try {
      updateTransactionStatus('confirming');
      
      console.log('handleConfirm - Executing transaction:', {
        type: modalState.type,
        amount: modalState.amount,
        vaultAddress: modalState.vaultAddress,
      });
      
      let retryCount = 0;
      const maxRetries = 1;

      const executeWithRetry = async (): Promise<string> => {
        try {
          if (modalState.type === 'deposit') {
            return await executeVaultAction('deposit', modalState.vaultAddress!, modalState.amount!);
          } else if (modalState.type === 'withdraw') {
            // If amount is specified, withdraw that amount, otherwise withdraw all
            if (modalState.amount && parseFloat(modalState.amount) > 0) {
              return await executeVaultAction('withdraw', modalState.vaultAddress!, modalState.amount);
            } else {
              return await executeVaultAction('withdrawAll', modalState.vaultAddress!);
            }
          } else if (modalState.type === 'withdrawAll') {
            return await executeVaultAction('withdrawAll', modalState.vaultAddress!);
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
      setCurrentTxHash(txHash);
      updateTransactionStatus('confirming', undefined, txHash);

    } catch (err) {
      console.error('Transaction failed:', err);
      
      // Check if this is a cancellation - handle separately
      if (isCancellationError(err)) {
        updateTransactionStatus('cancelled');
        // Auto-close modal after showing cancellation message
        setTimeout(() => {
          closeTransactionModal();
        }, 1500);
        return;
      }
      
      const errorMessage = formatTransactionError(err);
      updateTransactionStatus('error', errorMessage);
    }
  };

  // Get exposure icons from vault data
  const getExposureAssets = () => {
    if (!vaultData?.marketAssets) return [];
    return vaultData.marketAssets.map(asset => asset.symbol);
  };

  const exposureAssets = getExposureAssets();

  if (!modalState.isOpen) {
    return null;
  }

  const isConfirming = modalState.status === 'confirming';
  const isSuccess = modalState.status === 'success';
  const isError = modalState.status === 'error';
  const isCancelled = modalState.status === 'cancelled';

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
            Review
          </h2>
          {!isConfirming && !isCancelled && (
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
          {/* Success/Error States */}
          {isSuccess && (
            <div className="flex items-center justify-center gap-3 p-4 bg-[var(--success-subtle)] rounded-lg border border-[var(--success)]">
              <div className="w-8 h-8 rounded-full bg-[var(--success)] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Transaction successful!
              </p>
            </div>
          )}

          {isCancelled && (
            <div className="flex items-center justify-center gap-3 p-4 bg-[var(--surface)] rounded-lg">
              <p className="text-sm text-[var(--foreground-secondary)]">
                Transaction cancelled.
              </p>
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
                }}
                className="w-full px-4 py-3 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--foreground)] font-medium rounded-lg transition-colors text-sm"
              >
                Try Again
              </button>
            </>
          )}

          {isConfirming && (
            <div className="flex items-center justify-center gap-3 p-4 bg-[var(--surface)] rounded-lg">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Transaction submitted, waiting for confirmation...
              </p>
            </div>
          )}

          {/* Preview Content */}
          {modalState.status === 'preview' && (
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

              {/* Transaction Type */}
              <div>
                <p className="text-sm text-[var(--foreground-secondary)] mb-1">
                  {modalState.type === 'deposit' ? 'Deposit' : 'Withdraw'}
                </p>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-semibold text-[var(--foreground)]">
                    {/* Display the actual amount string from modalState to match what will be sent to transaction */}
                    {modalState.amount || '0'} {modalState.vaultSymbol}
                  </span>
                  {amountUsd > 0 && (
                    <span className="text-lg text-[var(--foreground-secondary)]">
                      {formatSmartCurrency(amountUsd)}
                    </span>
                  )}
                </div>
              </div>

              {/* Balance Change */}
              <div className="bg-[var(--surface)] rounded-lg p-4 space-y-2">
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Deposit ({modalState.vaultSymbol})
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

              {/* APY */}
              {vaultData && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--foreground-secondary)]">APY</span>
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
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <span className="text-lg font-semibold text-[var(--foreground)]">
                    {(vaultData.apy * 100).toFixed(2)}%
                  </span>
                </div>
              )}

              {/* Exposure */}
              {exposureAssets.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--foreground-secondary)]">Exposure</span>
                  <div className="flex items-center gap-2">
                    {exposureAssets.map((asset, idx) => (
                      <div
                        key={idx}
                        className="w-6 h-6 rounded-full bg-white flex items-center justify-center overflow-hidden"
                      >
                        <Image
                          src={getVaultLogo(asset)}
                          alt={asset}
                          width={24}
                          height={24}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
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
            </>
          )}

          {/* Transaction Hash - Only show when transaction is in progress or completed */}
          {currentTxHash && (modalState.status === 'confirming' || modalState.status === 'success') && (
            <div className="p-4 bg-[var(--surface)] rounded-lg">
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Transaction Hash</p>
              <p className="text-sm font-mono text-[var(--foreground)] break-all">
                {currentTxHash}
              </p>
            </div>
          )}

          {/* Confirm Button */}
          {modalState.status === 'preview' && (
            <button
              onClick={handleConfirm}
              disabled={isLoading || !modalState.amount || amount <= 0}
              className="w-full px-4 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
