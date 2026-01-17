'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWaitForTransactionReceipt, useReadContract, useWalletClient, usePublicClient, useAccount } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { VaultAccount } from '@/types/vault';
import { useTransactionState } from '@/contexts/TransactionContext';
import { useVaultTransactions, TransactionProgressStep } from '@/hooks/useVaultTransactions';
import { isCancellationError, formatTransactionError } from '@/lib/transactionUtils';
import { depositToVaultV2, withdrawFromVaultV2, redeemFromVaultV2, TransactionProgressStep as V2TransactionProgressStep } from '@/lib/transactionUtilsV2';
import { TransactionConfirmation } from './TransactionConfirmation';
import { TransactionStatus as TransactionStatusComponent } from './TransactionStatus';
import { useToast } from '@/contexts/ToastContext';
import { useWallet } from '@/contexts/WalletContext';
import { useVaultData } from '@/contexts/VaultDataContext';
import { BASE_WETH_ADDRESS } from '@/lib/constants';
import { VAULTS } from '@/lib/vaults';
import { logger } from '@/lib/logger';
import { useRouter } from 'next/navigation';
import { ERC4626_ABI } from '@/lib/abis';
import { getVaultVersion } from '@/lib/vault-utils';

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
    preferredAsset,
    setStatus,
  } = useTransactionState();
  const { success, error: showErrorToast } = useToast();
  const { refreshBalancesWithPolling, morphoHoldings, refreshBalances } = useWallet();
  const { fetchVaultData } = useVaultData();
  const router = useRouter();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address: accountAddress } = useAccount();

  const [currentTxHash, setCurrentTxHash] = useState<string | null>(null);
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
  const { getVaultData } = useVaultData();

  // Get vault position for withdrawals to check if MAX was used
  const vaultPosition = useMemo(() => {
    if (fromAccount?.type !== 'vault' || transactionType !== 'withdraw') return null;
    return morphoHoldings.positions.find(
      (pos) => pos.vault.address.toLowerCase() === (fromAccount as VaultAccount).address.toLowerCase()
    ) || null;
  }, [fromAccount, morphoHoldings.positions, transactionType]);

  const vaultShareBalance = vaultPosition?.shares || null;

  // Use convertToAssets via RPC to get exact asset amount from shares for max withdrawal check
  const { data: exactAssetAmount } = useReadContract({
    address: (transactionType === 'withdraw' && vaultShareBalance && fromAccount?.type === 'vault' 
      ? (fromAccount as VaultAccount).address 
      : undefined) as `0x${string}`,
    abi: ERC4626_ABI,
    functionName: 'convertToAssets',
    args: vaultShareBalance && fromAccount?.type === 'vault'
      ? [BigInt(vaultShareBalance)]
      : undefined,
    query: {
      enabled: transactionType === 'withdraw' && fromAccount?.type === 'vault' && !!vaultShareBalance && BigInt(vaultShareBalance) > BigInt(0),
    },
  });

  // Check if withdrawal amount matches max (within small tolerance for rounding)
  const shouldUseWithdrawAll = useMemo(() => {
    if (transactionType !== 'withdraw' || !fromAccount || fromAccount.type !== 'vault' || !amount || !exactAssetAmount) {
      return false;
    }

    const vaultAccount = fromAccount as VaultAccount;
    const vaultData = getVaultData(vaultAccount.address);
    if (!vaultData) return false;

    const maxAssetAmount = parseFloat(formatUnits(exactAssetAmount, vaultData.assetDecimals || 18));
    const enteredAmount = parseFloat(amount);

    if (isNaN(enteredAmount) || isNaN(maxAssetAmount) || maxAssetAmount === 0) {
      return false;
    }

    // Check if entered amount is within 0.1% of max (to account for rounding)
    const tolerance = maxAssetAmount * 0.001;
    return Math.abs(enteredAmount - maxAssetAmount) <= tolerance;
  }, [transactionType, fromAccount, amount, exactAssetAmount, getVaultData]);

  // Reset transaction hash and step when status changes
  useEffect(() => {
    if (status === 'idle' || status === 'preview') {
      setCurrentTxHash(null);
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

  // Note: We don't need to wait for prerequisite transaction receipts here because
  // executeVaultAction already waits for them internally using publicClient.waitForTransactionReceipt.
  // The onProgress callback will update the status appropriately as steps complete.
  // This avoids race conditions and duplicate waiting logic.

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
      
      // Refresh all data immediately after transaction confirmation
      const refreshData = async () => {
        try {
          // Immediate refresh of wallet balances
          await refreshBalances();
          
          // Refresh vault data for vaults specifically involved in the transaction
          const vaultsInTransaction = new Set<string>();
          if (fromAccount?.type === 'vault') {
            vaultsInTransaction.add((fromAccount as VaultAccount).address);
          }
          if (toAccount?.type === 'vault') {
            vaultsInTransaction.add((toAccount as VaultAccount).address);
          }
          
          // Refresh vaults involved in transaction
          await Promise.allSettled(
            Array.from(vaultsInTransaction).map(vaultAddress => 
              fetchVaultData(vaultAddress, 8453, true).catch((err) => {
                logger.error('Failed to refresh vault data', err, { vaultAddress, txHash: hashToUse });
              })
            )
          );
          
          // Also refresh vault data for all vaults the user has positions in
          const vaultsToRefresh = morphoHoldings.positions.map(pos => pos.vault.address);
          await Promise.allSettled(
            vaultsToRefresh.map(vaultAddress => 
              fetchVaultData(vaultAddress, 8453, true).catch((err) => {
                logger.error('Failed to refresh vault data', err, { vaultAddress, txHash: hashToUse });
              })
            )
          );
          
          // Force Next.js to refresh server-side data
          router.refresh();
          
          logger.info('Data refreshed successfully after transaction', {
            txHash: hashToUse,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error('Error refreshing data after transaction', error, { txHash: hashToUse });
        }
      };
      
      refreshData();
      
      // Also use polling to refresh balances (waits for blockchain state to update)
      // This ensures we get the updated balances even if there's a slight delay
      logger.info('Refreshing wallet balances after transaction with polling', {
        txHash: hashToUse,
        timestamp: new Date().toISOString(),
      });
      
      refreshBalancesWithPolling({
        maxAttempts: 10, // Try up to 10 times (30 seconds total with 3s intervals)
        intervalMs: 3000, // 3 seconds between attempts
        onComplete: async () => {
          logger.info('Wallet balances refreshed successfully after transaction', {
            txHash: hashToUse,
            timestamp: new Date().toISOString(),
          });
          
          // Handle WETH unwrapping for withdrawals to ETH
          if (transactionType === 'withdraw' && 
              fromAccount?.type === 'vault' && 
              preferredAsset === 'ETH' &&
              walletClient &&
              publicClient &&
              accountAddress) {
            const vaultAccount = fromAccount as VaultAccount;
            const isWethVault = vaultAccount.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase() ||
                               vaultAccount.address.toLowerCase() === VAULTS.WETH_VAULT_V2.address.toLowerCase();
            
            if (isWethVault) {
              try {
                // Get WETH balance to unwrap (the amount we just withdrew)
                const wethBalance = await publicClient.readContract({
                  address: BASE_WETH_ADDRESS,
                  abi: [
                    {
                      inputs: [{ name: "account", type: "address" }],
                      name: "balanceOf",
                      outputs: [{ name: "", type: "uint256" }],
                      stateMutability: "view",
                      type: "function",
                    },
                  ],
                  functionName: 'balanceOf',
                  args: [accountAddress as Address],
                }) as bigint;
                
                // Unwrap all WETH to ETH
                if (wethBalance > BigInt(0)) {
                  logger.info('Unwrapping WETH to ETH after withdrawal', {
                    wethAmount: wethBalance.toString(),
                    timestamp: new Date().toISOString(),
                  });
                  
                  const unwrapHash = await walletClient.writeContract({
                    address: BASE_WETH_ADDRESS,
                    abi: [
                      {
                        inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
                        name: "withdraw",
                        outputs: [],
                        stateMutability: "nonpayable",
                        type: "function",
                      },
                    ],
                    functionName: 'withdraw',
                    args: [wethBalance],
                  });
                  
                  logger.info('WETH unwrap transaction sent', {
                    txHash: unwrapHash,
                    timestamp: new Date().toISOString(),
                  });
                  
                  // Wait for unwrap transaction to complete
                  await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
                  
                  logger.info('WETH successfully unwrapped to ETH', {
                    txHash: unwrapHash,
                    timestamp: new Date().toISOString(),
                  });
                  
                  // Refresh balances again after unwrapping
                  await refreshBalances();
                }
              } catch (err) {
                // Log error but don't fail the entire transaction
                logger.error('Failed to unwrap WETH to ETH', err, {
                  txHash: hashToUse,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        },
      }).catch((err: unknown) => {
        logger.error('Failed to refresh wallet balances after polling', err, { txHash: hashToUse });
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
        setStepsInfo([]);
        setTotalSteps(0);
      } else {
        const errorMessage = formatTransactionError(receiptError);
        showErrorToast(errorMessage, 5000);
        setStatus('error', errorMessage);
      }
    }
    // Note: refreshBalancesWithPolling is intentionally excluded from deps to avoid unnecessary re-runs
    // morphoHoldings is included but its reference changes frequently - the effect handles this correctly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt, receiptError, status, txHash, currentTxHash, fromAccount, toAccount, refreshBalances, fetchVaultData, morphoHoldings, router, success, setStatus, showErrorToast]);

  const handleConfirm = async () => {
    if (!fromAccount || !toAccount || !amount || !transactionType) return;

    // Check if transaction involves a v2 vault
    const fromVaultVersion = fromAccount.type === 'vault' ? getVaultVersion((fromAccount as VaultAccount).address) : null;
    const toVaultVersion = toAccount.type === 'vault' ? getVaultVersion((toAccount as VaultAccount).address) : null;
    const isV2Transaction = fromVaultVersion === 'v2' || toVaultVersion === 'v2';

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

    // Validate wallet and public clients are available
    if (!walletClient || !publicClient) {
      const errorMessage = 'Wallet not connected. Please connect your wallet and try again.';
      setStatus('error', errorMessage);
      showErrorToast(errorMessage, 5000);
      return;
    }

    try {
      // Don't set status here - let onProgress callback set it based on actual step
      // This ensures we start with the correct status (signing/approving) for pre-authorization
      
      logger.info('Transaction execution started', {
        transactionType,
        fromAccount: fromAccount?.type === 'wallet' ? 'wallet' : (fromAccount as VaultAccount)?.address,
        toAccount: toAccount?.type === 'wallet' ? 'wallet' : (toAccount as VaultAccount)?.address,
        amount,
        assetSymbol: assetToUse.symbol,
        isV2: isV2Transaction,
        timestamp: new Date().toISOString(),
      });
      
      const onProgress = (step: TransactionProgressStep | V2TransactionProgressStep) => {
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
            // Capture txHash for both approving and confirming steps
            txHash: step.type === 'confirming' ? step.txHash : (step.type === 'approving' && 'txHash' in step ? step.txHash : undefined)
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
        
        // Update status based on step type - this ensures proper state transitions
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

      // Use v2 transaction functions for v2 vaults, otherwise use bundler (v1)
      if (isV2Transaction) {
        // Type assertion needed because wagmi's usePublicClient/useWalletClient return types
        // that are compatible but TypeScript can't infer the exact match
        if (transactionType === 'deposit') {
          const vaultAddress = (toAccount as VaultAccount).address as Address;
          txHash = await depositToVaultV2(
            publicClient as any,
            walletClient as any,
            vaultAddress,
            amount,
            assetToUse.decimals,
            preferredAsset,
            onProgress
          );
        } else if (transactionType === 'withdraw') {
          const vaultAddress = (fromAccount as VaultAccount).address as Address;
          // For withdrawals, preferredAsset should be 'ETH' or 'WETH' (not 'ALL')
          const withdrawPreferredAsset = preferredAsset === 'ALL' ? undefined : (preferredAsset as 'ETH' | 'WETH' | undefined);
          // Use redeem (withdraw all) if amount matches max, otherwise use regular withdraw
          if (shouldUseWithdrawAll) {
            txHash = await redeemFromVaultV2(
              publicClient as any,
              walletClient as any,
              vaultAddress,
              assetToUse.decimals,
              withdrawPreferredAsset,
              onProgress
            );
          } else {
            txHash = await withdrawFromVaultV2(
              publicClient as any,
              walletClient as any,
              vaultAddress,
              amount,
              assetToUse.decimals,
              withdrawPreferredAsset,
              onProgress
            );
          }
        } else if (transactionType === 'transfer') {
          // Transfer not supported for v2 yet (would need to combine withdraw + deposit)
          throw new Error('Vault-to-vault transfers are not yet supported for v2 vaults');
        } else {
          throw new Error('Invalid transaction type');
        }
      } else {
        // Use v1 bundler-based transactions
        if (transactionType === 'deposit') {
          const vaultAddress = (toAccount as VaultAccount).address;
          txHash = await executeVaultAction('deposit', vaultAddress, amount, onProgress, undefined, assetToUse.decimals, preferredAsset);
        } else if (transactionType === 'withdraw') {
          const vaultAddress = (fromAccount as VaultAccount).address;
          // Use withdrawAll (redeem) if amount matches max, otherwise use regular withdraw
          if (shouldUseWithdrawAll) {
            txHash = await executeVaultAction('withdrawAll', vaultAddress, undefined, onProgress, undefined, assetToUse.decimals, preferredAsset);
          } else {
            txHash = await executeVaultAction('withdraw', vaultAddress, amount, onProgress, undefined, assetToUse.decimals, preferredAsset);
          }
        } else if (transactionType === 'transfer') {
          // For transfer, withdraw from source vault and deposit to destination vault in single bundle
          const sourceVaultAddress = (fromAccount as VaultAccount).address;
          const destVaultAddress = (toAccount as VaultAccount).address;
          txHash = await executeVaultAction('transfer', sourceVaultAddress, amount, onProgress, destVaultAddress, assetToUse.decimals);
        } else {
          throw new Error('Invalid transaction type');
        }
      }

      if (!currentTxHash && txHash) {
        setCurrentTxHash(txHash);
      }

    } catch (err) {
      if (isCancellationError(err)) {
        setStatus('preview');
        setCurrentTxHash(null);
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
  // Since executeVaultAction waits for prerequisite receipts internally, we determine
  // step completion based on status progression rather than individual receipt tracking
  const walletSteps = (isSigning || isApproving || isConfirming || isSuccess) ? (() => {
    const effectiveTotalSteps = totalSteps > 0 ? totalSteps : (stepsInfo.length > 0 ? Math.max(...stepsInfo.map(s => s.stepIndex)) + 1 : 0);
    
    if (effectiveTotalSteps > 0) {
      return Array.from({ length: effectiveTotalSteps }, (_, i) => {
        const stepInfo = stepsInfo.find(s => s.stepIndex === i);
        
        // Determine if step is completed:
        // - Confirming steps: completed if we have a receipt
        // - Signing/approving steps: completed if status has progressed past them
        //   (i.e., if we're in confirming/success, all previous steps are done)
        let isCompleted = false;
        if (stepInfo) {
          if (stepInfo.type === 'confirming') {
            isCompleted = !!receipt || isSuccess;
          } else if (stepInfo.type === 'signing' || stepInfo.type === 'approving') {
            // If we're in confirming or success, all prerequisite steps are completed
            // (executeVaultAction waits for them internally before proceeding)
            isCompleted = isConfirming || isSuccess;
          }
        }
        
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
          amount={amount?.trim() || ''}
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

