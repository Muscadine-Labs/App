'use client';

/*
Add available to deposit, avaliable to withdraw. Add a better ui for the approval and deposit flow



*/
import { Vault } from '../../../types/vault';
import { useVaultDataFetch } from '../../../hooks/useVaultDataFetch';
import { useAccount } from 'wagmi';
import { formatSmartCurrency } from '../../../lib/formatter';
import { CloseIcon, MoneyInIcon, MoneyOutIcon } from '../../ui';
import Image from "next/image";
import { getVaultLogo } from '../../../types/vault';
import { useWallet } from '../../../contexts/WalletContext';
import { useTransactionModal } from '../../../contexts/TransactionModalContext';
import { useElementTracker } from '../../../hooks/useElementTracker';
import { useEffect, useRef } from 'react';

interface VaultInteractionOverlayProps {
  selectedVault: Vault | null;
  onClose: () => void;
}

export default function VaultInteractionOverlay({ selectedVault, onClose }: VaultInteractionOverlayProps) {
  const { vaultData, isLoading, hasError, refetch } = useVaultDataFetch(selectedVault);
  const { isConnected } = useAccount();
  const { morphoHoldings } = useWallet();
  const { openTransactionModal } = useTransactionModal();
  const { registerElement, unregisterElement, onHoverStart, onHoverEnd } = useElementTracker({ component: 'VaultInteractionOverlay' });

  // Find the current vault position from morphoHoldings
  const currentVaultPosition = morphoHoldings.positions.find(
    pos => pos.vault.address.toLowerCase() === vaultData?.address.toLowerCase()
  );

  // Calculate user's vault holdings
  const userVaultShares = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18).toFixed(6) : '0';

  const userVaultValueUsd = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18) * currentVaultPosition.vault.state.sharePriceUsd : 0;

  // Element tracking for learning system (diff-based to avoid loops)
  const registeredIdsRef = useRef<Set<string>>(new Set());
  const hasVault = Boolean(selectedVault && vaultData);

  useEffect(() => {
    const next = new Set<string>();
    if (hasVault) {
      next.add('deposit-form');
      next.add('withdraw-form');
      next.add('transaction-status');
      next.add('overlay-vault-value');
    }

    const prev = registeredIdsRef.current;
    // Register new
    next.forEach(id => {
      if (!prev.has(id)) registerElement(id as any, {});
    });
    // Unregister removed
    prev.forEach(id => {
      if (!next.has(id)) unregisterElement(id);
    });
    registeredIdsRef.current = next;
  }, [hasVault, registerElement, unregisterElement]);

  useEffect(() => {
    return () => {
      registeredIdsRef.current.forEach(id => unregisterElement(id));
      registeredIdsRef.current.clear();
    };
  }, [unregisterElement]);



  const handleDeposit = () => {
    if (!selectedVault || !vaultData || !isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    openTransactionModal(
      'deposit',
      selectedVault.address,
      selectedVault.name,
      selectedVault.symbol,
      '1.0'
    );
  };

  const handleWithdraw = () => {
    if (!selectedVault || !isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    openTransactionModal(
      'withdraw',
      selectedVault.address,
      selectedVault.name,
      selectedVault.symbol
    );
  };

  if (!selectedVault) {
    return null;
  }

  return (
    <div className="h-full bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden">
              <Image 
                src={getVaultLogo(selectedVault.symbol)} 
                alt={`${selectedVault.symbol} logo`}
                width={32}
                height={32}
                className={`w-full h-full object-contain ${
                  selectedVault.symbol === 'WETH' ? 'scale-75' : ''
                }`}
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                {selectedVault.name}
              </h2>
              <p className="text-sm text-[var(--foreground-secondary)]">
                {selectedVault.symbol}
              </p>
            </div>
            
          </div>
          
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <CloseIcon size="sm" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {isLoading && !vaultData ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
              <p className="text-[var(--foreground-muted)] text-sm mt-2">
                Loading vault data...
              </p>
            </div>
          ) : hasError && !vaultData ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-[var(--danger)] text-sm">
                Failed to load vault data
              </p>
              <button 
                onClick={refetch}
                className="text-[var(--primary)] text-sm mt-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : vaultData ? (
            <div className="flex flex-col h-full">
              {/* Key Stats - 2 Column Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Left Column - TVL, Liquidity, and APY */}
                <div className="space-y-3">
                  <div className="bg-[var(--surface-elevated)] rounded-lg p-4 text-center">
                    <p className="text-xs text-[var(--foreground-secondary)] mb-1">APY</p>
                    <p className="text-lg font-semibold text-[var(--success)]">
                      {(vaultData.apy * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div className="bg-[var(--surface-elevated)] rounded-lg p-4 text-center">
                    <p className="text-xs text-[var(--foreground-secondary)] mb-1">Total Value Locked</p>
                    <p className="text-lg font-semibold text-[var(--foreground)]">
                      {formatSmartCurrency(vaultData.totalValueLocked)}
                    </p>
                  </div>
                  <div className="bg-[var(--surface-elevated)] rounded-lg p-4 text-center">
                    <p className="text-xs text-[var(--foreground-secondary)] mb-1">Available Liquidity</p>
                    <p className="text-lg font-semibold text-[var(--foreground)]">
                      {formatSmartCurrency(vaultData.currentLiquidity)}
                    </p>
                  </div>
                
                  
                </div>

                {/* Right Column - Enhanced Math Equation */}
                {isConnected && (
                  <div className="bg-[var(--surface-elevated)] rounded-lg p-4">
                    {morphoHoldings.isLoading ? (
                      <div className="text-center">
                        <p className="text-sm text-[var(--foreground-secondary)]">Loading vault holdings...</p>
                      </div>
                    ) : morphoHoldings.error ? (
                      <div className="text-center">
                        <p className="text-sm text-[var(--danger)]">Error: {morphoHoldings.error}</p>
                      </div>
                    ) : currentVaultPosition ? (
                      <>
                        <p className="text-xs text-[var(--foreground-secondary)] mb-4 text-center font-medium">
                          Your Vault Value
                        </p>
                        
                        {/* Traditional Vertical Math Equation */}
                        <div className="bg-[var(--surface)] rounded-lg p-4" onMouseEnter={() => onHoverStart('overlay-vault-value')} onMouseLeave={() => onHoverEnd('overlay-vault-value')}>
                          <div className="space-y-3">
                            {/* Top number - Shares */}
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[var(--foreground-secondary)]">Your Vault Shares</p>
                              <p className="text-xl font-mono font-semibold text-[var(--primary)]">
                                {userVaultShares}
                              </p>
                            </div>
                            
                            {/* Multiplication line */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                
                                <p className="text-xs text-[var(--foreground-secondary)]">Share Price</p>
                              </div>
                              <p className="text-lg font-mono font-semibold text-[var(--foreground)]">
                                x ${currentVaultPosition.vault.state.sharePriceUsd.toFixed(4)}
                              </p>
                            </div>
                            
                            {/* Horizontal line */}
                            <div className="border-t-2 border-[var(--border-subtle)]"></div>
                            
                            {/* Result */}
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[var(--success)]">Your Total Value</p>
                              <p className="text-2xl font-mono font-bold text-[var(--success)]">
                                = ${userVaultValueUsd.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm text-[var(--foreground-muted)]">No holdings in this vault</p>
                      </div>
                    )}
                  </div>
                )}
              </div>


              {/* Action Selection Buttons */}
              {isConnected && (
                <div className="flex gap-3 mt-auto pt-4">
                  <button 
                    onClick={handleDeposit}
                    className="w-full bg-[var(--success)] hover:bg-[var(--success-hover)] text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    Deposit
                    <MoneyInIcon size="sm" />
                  </button>
                  
                  <button 
                    onClick={handleWithdraw}
                    className="w-full bg-[var(--red)] hover:bg-[var(--red-hover)] text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    Withdraw
                    <MoneyOutIcon size="sm" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-[var(--foreground-muted)] text-sm">
                No vault data available
              </p>
            </div>
          )}
        </div>


    </div>
  );
};
