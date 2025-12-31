'use client';

import Image from 'next/image';
import { Account, VaultAccount, getVaultLogo } from '@/types/vault';
import { TransactionType, useTransactionState } from '@/contexts/TransactionContext';
import { truncateAddress, formatAssetBalance } from '@/lib/formatter';
import { Button } from '@/components/ui';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { TransactionProgressBar } from './TransactionProgressBar';
import CopiableAddress from '@/components/common/CopiableAddress';

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

  const handleDone = () => {
    if (isSuccess) {
      reset();
      router.push('/');
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
                  <CopiableAddress address={txHash} showFullAddress={true} className="text-sm font-medium break-all text-left" />
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
                <>
                  <p className="text-sm font-medium text-[var(--foreground)] mb-1">Wallet</p>
                  {address && (
                    <div className="break-all text-left">
                      <CopiableAddress address={address} showFullAddress={true} className="text-sm font-medium break-all text-left" />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-[var(--foreground)] mb-1">{(fromAccount as VaultAccount).name}</p>
                  <div className="break-all text-left">
                    <CopiableAddress address={(fromAccount as VaultAccount).address} showFullAddress={true} className="text-sm font-medium break-all text-left" />
                  </div>
                </>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--foreground-secondary)] mb-1">To</p>
              {toAccount.type === 'wallet' ? (
                <>
                  <p className="text-sm font-medium text-[var(--foreground)] mb-1">Wallet</p>
                  {address && (
                    <div className="break-all text-left">
                      <CopiableAddress address={address} showFullAddress={true} className="text-sm font-medium break-all text-left" />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-[var(--foreground)] mb-1">{(toAccount as VaultAccount).name}</p>
                  <div className="break-all text-left">
                    <CopiableAddress address={(toAccount as VaultAccount).address} showFullAddress={true} className="text-sm font-medium break-all text-left" />
                  </div>
                </>
              )}
            </div>
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <p className="text-sm font-semibold text-[var(--foreground-secondary)] mb-1">Amount</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{formattedAmount}</p>
            </div>
          </div>
        </div>

        {/* View on Explorer Button */}
        {txHash && (
          <Button
            onClick={() => window.open(`https://basescan.org/tx/${txHash}`, '_blank')}
            variant="primary"
            size="lg"
            fullWidth
            className="mb-6"
          >
            View on Explorer
          </Button>
        )}

        {/* Done Button */}
        <Button
          onClick={handleDone}
          variant="secondary"
          size="lg"
          fullWidth
        >
          Done
        </Button>
      </div>
    );
  }

  // Preview/Confirm state - Original design
  return (
    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-[var(--foreground)]">Confirm Transaction</h3>
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">
            Review the details before confirming
          </p>
        </div>
        <div className="px-3 py-1.5 bg-[var(--primary-subtle)] rounded-lg">
          <span className="text-sm font-medium text-[var(--primary)]">
            {getTransactionTypeLabel()}
          </span>
        </div>
      </div>

      {/* Transaction Details Card */}
      <div className="bg-[var(--surface-elevated)] rounded-lg p-5 space-y-4">
        {/* From Account */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-[var(--border-subtle)]">
              <Image 
                src={getVaultLogo(assetSymbol)} 
                alt={fromAccount.type === 'wallet' ? 'Wallet' : (fromAccount as VaultAccount).name}
                width={48}
                height={48}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">From</p>
              <p className="text-base font-semibold text-[var(--foreground)] truncate">
                {fromAccount.type === 'wallet' 
                  ? (address ? `Wallet ${truncateAddress(address)}` : 'Wallet')
                  : (fromAccount as VaultAccount).name}
              </p>
            </div>
          </div>
          <div className="text-right ml-4">
            <p className="text-lg font-semibold text-[var(--danger)]">
              -{formattedAmount}
            </p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-10 rounded-full bg-[var(--background)] flex items-center justify-center border-2 border-[var(--border-subtle)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-[var(--foreground-secondary)]"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>
        </div>

        {/* To Account */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-[var(--border-subtle)]">
              <Image 
                src={getVaultLogo(assetSymbol)} 
                alt={toAccount.type === 'wallet' ? 'Wallet' : (toAccount as VaultAccount).name}
                width={48}
                height={48}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">To</p>
              <p className="text-base font-semibold text-[var(--foreground)] truncate">
                {toAccount.type === 'wallet' 
                  ? (address ? `Wallet ${truncateAddress(address)}` : 'Wallet')
                  : (toAccount as VaultAccount).name}
              </p>
              {toAccount.type === 'vault' && (
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  {truncateAddress((toAccount as VaultAccount).address as `0x${string}`)}
                </p>
              )}
            </div>
          </div>
          <div className="text-right ml-4">
            <p className="text-lg font-semibold text-[var(--success)]">
              +{formattedAmount}
            </p>
          </div>
        </div>
      </div>

      {/* Note for WETH deposits */}
      {transactionType === 'deposit' && assetSymbol === 'WETH' && fromAccount.type === 'wallet' && (
        <div className="flex items-start gap-3 p-4 bg-[var(--info-subtle)] rounded-lg border border-[var(--info)]">
          <div className="w-5 h-5 rounded-full bg-[var(--info)] flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--foreground)]">
            <span className="font-medium">Note:</span> Depositing ETH will wrap it to WETH. USDC can be used for gas fees on Base.
          </p>
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

      {/* Progress Bar - Show at bottom when transaction is in progress */}
      {showProgress && progressSteps.length > 0 && (
        <div className="pt-4 border-t border-[var(--border-subtle)]">
          <TransactionProgressBar steps={progressSteps} isSuccess={isSuccess} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
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
              {isLoading ? 'Processing...' : 'Confirm Transaction'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

