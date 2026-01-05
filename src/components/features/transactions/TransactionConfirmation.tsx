'use client';

import Image from 'next/image';
import { Account, VaultAccount, getVaultLogo } from '@/types/vault';
import { TransactionType, useTransactionState } from '@/contexts/TransactionContext';
import { formatAssetBalance } from '@/lib/formatter';
import { Button } from '@/components/ui';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { TransactionProgressBar } from './TransactionProgressBar';
import { useToast } from '@/contexts/ToastContext';
import { useVaultData } from '@/contexts/VaultDataContext';
import { useWallet } from '@/contexts/WalletContext';
import { logger } from '@/lib/logger';

interface TransactionConfirmationProps {
  fromAccount: Account;
  toAccount: Account;
  amount: string;
  assetSymbol: string;
  assetDecimals?: number;
  transactionType: TransactionType | null;
  isLoading: boolean;
  progressSteps?: Array<{ label: string; completed: boolean; active: boolean }>;
  showProgress?: boolean;
  isSuccess?: boolean;
  txHash?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function TransactionConfirmation({
  fromAccount,
  toAccount,
  amount,
  assetSymbol,
  assetDecimals,
  transactionType,
  isLoading,
  progressSteps = [],
  showProgress = false,
  isSuccess = false,
  txHash,
  onCancel,
  onConfirm,
}: TransactionConfirmationProps) {
  const { address } = useAccount();
  const router = useRouter();
  const { reset } = useTransactionState();
  const { error: showErrorToast, showToast } = useToast();
  const { fetchVaultData } = useVaultData();
  const { refreshBalances } = useWallet();

  const handleDone = async () => {
    if (isSuccess) {
      // Refresh all data to ensure fresh values
      try {
        // Refresh wallet balances (includes Morpho positions)
        await refreshBalances();
        
        // Refresh vault data for any vaults involved in the transaction (force refresh to bypass cache)
        if (fromAccount.type === 'vault') {
          const vaultAddress = (fromAccount as VaultAccount).address;
          await fetchVaultData(vaultAddress, 8453, true);
        }
        if (toAccount.type === 'vault') {
          const vaultAddress = (toAccount as VaultAccount).address;
          await fetchVaultData(vaultAddress, 8453, true);
        }
        
        // Force Next.js to refresh server-side data
        router.refresh();
      } catch (error) {
        logger.error('Error refreshing data after transaction', error instanceof Error ? error : new Error(String(error)), {
          fromAccount: fromAccount.type === 'vault' ? (fromAccount as VaultAccount).address : 'wallet',
          toAccount: toAccount.type === 'vault' ? (toAccount as VaultAccount).address : 'wallet',
        });
        // Continue with reset even if refresh fails
      }
      
      reset();
      // Reset state and stay on transactions page to start a new transaction
      router.push('/transact');
    } else {
      onCancel();
    }
  };

  const getTransactionTypeLabel = () => {
    if (transactionType === 'deposit') return 'Deposit';
    if (transactionType === 'withdraw') return 'Withdraw';
    if (transactionType === 'transfer') return 'Transfer';
    return 'Transaction';
  };

  const formatAmount = () => {
    if (!amount || amount === '') {
      return `0.00 ${assetSymbol}`;
    }
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      return `0.00 ${assetSymbol}`;
    }
    
    return formatAssetBalance(amount, assetSymbol, assetDecimals, true);
  };

  const formattedAmount = formatAmount();

  // Get current date for transaction details
  const getCurrentDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric' 
    });
  };

  // Format vault name - remove "Muscadine " prefix on mobile
  const formatVaultName = (name: string) => {
    return name.replace(/^Muscadine /, '');
  };

  // Copy address to clipboard
  const handleCopyAddress = async (addressToCopy: string, name: string) => {
    if (!addressToCopy) return;
    try {
      await navigator.clipboard.writeText(addressToCopy);
      showToast(`${name} address copied to clipboard`, 'neutral', 2000);
    } catch (err) {
      logger.error('Failed to copy address', err instanceof Error ? err : new Error(String(err)), { address: addressToCopy, name });
      showErrorToast('Failed to copy to clipboard', 5000);
    }
  };

  if (isSuccess) {
    // Success state - Payment confirmation style
    return (
      <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-8">
        {/* Title */}
        <h2 className="text-2xl font-semibold text-[var(--foreground)] text-center mb-2">
          Transaction confirmed
        </h2>

        {/* Transaction Details */}
        <div className="mb-6">
          <div className="space-y-4">
            {txHash && (
              <div className="min-w-0">
                <p className="text-sm text-[var(--foreground-secondary)] mb-1">Transaction hash</p>
                <div className="break-all text-left">
                  <button
                    onClick={async () => {
                      if (!txHash) return;
                      try {
                        await navigator.clipboard.writeText(txHash);
                        showToast('Copied! View on', 'neutral', 3000, `https://basescan.org/tx/${txHash}`, 'Basescan');
                      } catch (err) {
                        logger.error('Failed to copy transaction hash', err instanceof Error ? err : new Error(String(err)), { txHash });
                        showErrorToast('Failed to copy to clipboard', 5000);
                      }
                    }}
                    className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors break-all text-left cursor-pointer"
                    title="Click to copy"
                  >
                    {txHash}
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-[var(--foreground-secondary)] mb-1">Date</p>
              <p className="text-sm font-medium text-[var(--foreground)]">{getCurrentDate()}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--foreground-secondary)] mb-1">Type</p>
              <p className="text-sm font-medium text-[var(--foreground)]">{getTransactionTypeLabel()}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--foreground-secondary)] mb-1">From</p>
              {fromAccount.type === 'wallet' ? (
                <button
                  onClick={() => address && handleCopyAddress(address, 'Wallet')}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200"
                  title={`Click to copy: ${address}`}
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    <span className="md:hidden">Wallet ...{address?.slice(-4)}</span>
                    <span className="hidden md:inline">Wallet</span>
                  </p>
                </button>
              ) : (
                <button
                  onClick={() => handleCopyAddress((fromAccount as VaultAccount).address, (fromAccount as VaultAccount).name)}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200"
                  title={`Click to copy: ${(fromAccount as VaultAccount).address}`}
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    <span className="md:hidden">{formatVaultName((fromAccount as VaultAccount).name)}</span>
                    <span className="hidden md:inline">{(fromAccount as VaultAccount).name}</span>
                  </p>
                </button>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--foreground-secondary)] mb-1">To</p>
              {toAccount.type === 'wallet' ? (
                <button
                  onClick={() => address && handleCopyAddress(address, 'Wallet')}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200"
                  title={`Click to copy: ${address}`}
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    <span className="md:hidden">Wallet ...{address?.slice(-4)}</span>
                    <span className="hidden md:inline">Wallet</span>
                  </p>
                </button>
              ) : (
                <button
                  onClick={() => handleCopyAddress((toAccount as VaultAccount).address, (toAccount as VaultAccount).name)}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200"
                  title={`Click to copy: ${(toAccount as VaultAccount).address}`}
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    <span className="md:hidden">{formatVaultName((toAccount as VaultAccount).name)}</span>
                    <span className="hidden md:inline">{(toAccount as VaultAccount).name}</span>
                  </p>
                </button>
              )}
            </div>
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <p className="text-sm font-semibold text-[var(--foreground-secondary)] mb-1">Amount</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{formattedAmount}</p>
            </div>
          </div>
        </div>

        {/* New Transaction Button */}
        <Button
          onClick={handleDone}
          variant="primary"
          size="lg"
          fullWidth
          className="mb-4"
        >
          New Transaction
        </Button>

        {/* Back to Dashboard Button */}
        <Button
          onClick={() => {
            reset();
            router.push('/');
          }}
          variant="secondary"
          size="lg"
          fullWidth
        >
          Back to Dashboard
        </Button>

      </div>
    );
  }

  // Preview/Confirm state - Original design
  return (
    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start md:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg md:text-xl font-semibold text-[var(--foreground)]">Confirm Transaction</h3>
          <p className="text-xs md:text-sm text-[var(--foreground-secondary)] mt-0.5 md:mt-1">
            Review the details before confirming
          </p>
        </div>
        <div className="px-2 py-1 md:px-3 md:py-1.5 bg-[var(--primary-subtle)] rounded-lg shrink-0">
          <span className="text-xs md:text-sm font-medium text-[var(--primary)]">
            {getTransactionTypeLabel()}
          </span>
        </div>
      </div>

      {/* Transaction Details Card */}
      <div className="bg-[var(--surface-elevated)] rounded-lg p-3 md:p-5 space-y-3 md:space-y-4">
        {/* From Account */}
        <div className="flex items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-[var(--border-subtle)] shrink-0">
              <Image 
                src={getVaultLogo(assetSymbol)} 
                alt={fromAccount.type === 'wallet' ? 'Wallet' : (fromAccount as VaultAccount).name}
                width={48}
                height={48}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] md:text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">From</p>
              {fromAccount.type === 'wallet' ? (
                <button
                  onClick={() => address && handleCopyAddress(address, 'Wallet')}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200"
                  title={`Click to copy: ${address}`}
                >
                  <p className="text-sm md:text-base font-semibold text-[var(--foreground)]">
                    Wallet ...{address?.slice(-4)}
                  </p>
                </button>
              ) : (
                <button
                  onClick={() => handleCopyAddress((fromAccount as VaultAccount).address, (fromAccount as VaultAccount).name)}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200 truncate w-full"
                  title={`Click to copy: ${(fromAccount as VaultAccount).address}`}
                >
                  <p className="text-sm md:text-base font-semibold text-[var(--foreground)] truncate">
                    <span className="md:hidden">{formatVaultName((fromAccount as VaultAccount).name)}</span>
                    <span className="hidden md:inline">{(fromAccount as VaultAccount).name}</span>
                  </p>
                </button>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base md:text-lg font-semibold text-[var(--danger)]">
              -{formattedAmount}
            </p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center py-1 md:py-2">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[var(--background)] flex items-center justify-center border-2 border-[var(--border-subtle)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 md:w-5 md:h-5 text-[var(--foreground-secondary)]"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
        </div>

        {/* To Account */}
        <div className="flex items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-[var(--border-subtle)] shrink-0">
              <Image 
                src={getVaultLogo(assetSymbol)} 
                alt={toAccount.type === 'wallet' ? 'Wallet' : (toAccount as VaultAccount).name}
                width={48}
                height={48}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] md:text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">To</p>
              {toAccount.type === 'wallet' ? (
                <button
                  onClick={() => address && handleCopyAddress(address, 'Wallet')}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200"
                  title={`Click to copy: ${address}`}
                >
                  <p className="text-sm md:text-base font-semibold text-[var(--foreground)]">
                    Wallet ...{address?.slice(-4)}
                  </p>
                </button>
              ) : (
                <button
                  onClick={() => handleCopyAddress((toAccount as VaultAccount).address, (toAccount as VaultAccount).name)}
                  className="text-left cursor-pointer hover:text-[var(--primary)] transition-colors duration-200 truncate w-full"
                  title={`Click to copy: ${(toAccount as VaultAccount).address}`}
                >
                  <p className="text-sm md:text-base font-semibold text-[var(--foreground)] truncate">
                    <span className="md:hidden">{formatVaultName((toAccount as VaultAccount).name)}</span>
                    <span className="hidden md:inline">{(toAccount as VaultAccount).name}</span>
                  </p>
                </button>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base md:text-lg font-semibold text-[var(--success)]">
              +{formattedAmount}
            </p>
          </div>
        </div>
      </div>

      {/* Note for WETH deposits */}
      {transactionType === 'deposit' && assetSymbol === 'WETH' && fromAccount.type === 'wallet' && (
        <div className="flex items-start gap-2 md:gap-3 p-3 md:p-4 bg-[var(--info-subtle)] rounded-lg border border-[var(--info)]">
          <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-[var(--info)] flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xs md:text-sm text-[var(--foreground)]">
            <span className="font-medium">Note:</span> Depositing ETH will wrap it to WETH. USDC can be used for gas fees on Base.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="pt-3 md:pt-4 border-t border-[var(--border-subtle)]">
        <p className="text-[10px] md:text-xs text-[var(--foreground-secondary)] leading-relaxed">
          By confirming this transaction, you agree to the{' '}
          <a
            href="https://muscadine.io/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] hover:underline"
          >
            Terms of Use
          </a>
          {', '}
          <a
            href="https://muscadine.io/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] hover:underline"
          >
            Privacy Policy
          </a>
          {' '}and the services provisions relating to the Morpho Vault.
        </p>
      </div>

      {/* Progress Bar - Show at bottom when transaction is in progress */}
      {showProgress && progressSteps.length > 0 && (
        <div className="pt-3 md:pt-4 border-t border-[var(--border-subtle)]">
          <TransactionProgressBar steps={progressSteps} isSuccess={isSuccess} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 md:gap-3 pt-2">
        {isSuccess ? (
          <Button
            onClick={onCancel}
            variant="primary"
            size="lg"
            fullWidth
          >
            Done
          </Button>
        ) : (
          <>
            <Button
              onClick={onCancel}
              disabled={isLoading}
              variant="secondary"
              size="lg"
              fullWidth
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading || !amount || parseFloat(amount) <= 0}
              variant="primary"
              size="lg"
              fullWidth
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

