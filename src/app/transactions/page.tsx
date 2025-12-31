'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { AccountSelector, TransactionFlow, TransactionProgressBar } from '@/components/features/transactions';
import { useTransactionState } from '@/contexts/TransactionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useVaultData } from '@/contexts/VaultDataContext';
import { usePrices } from '@/app/PriceContext';
import { VAULTS } from '@/lib/vaults';
import { VaultAccount, WalletAccount } from '@/types/vault';
import { formatBigIntForInput, formatWalletBalance, formatVaultAssetBalance, formatAvailableBalance, formatAssetAmountForMax } from '@/lib/formatter';
import { Button } from '@/components/ui';
import { formatUnits, parseUnits } from 'viem';
import { BASE_WETH_ADDRESS } from '@/lib/constants';

// ERC-4626 ABI for convertToAssets
const ERC4626_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function TransactionsPage() {
  const { isConnected } = useAccount();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tokenBalances, ethBalance, morphoHoldings } = useWallet();
  const vaultDataContext = useVaultData();
  const { btc: btcPrice, eth: ethPrice } = usePrices();
  const {
    fromAccount,
    toAccount,
    amount,
    status,
    derivedAsset,
    setFromAccount,
    setToAccount,
    setAmount,
    setStatus,
    reset,
  } = useTransactionState();

  // Handle URL params for pre-filling vault (when navigating from vault page)
  useEffect(() => {
    const vaultAddress = searchParams.get('vault');
    const action = searchParams.get('action'); // 'deposit' or 'withdraw'

    if (vaultAddress && action) {
      const vault = Object.values(VAULTS).find((v) => v.address.toLowerCase() === vaultAddress.toLowerCase());
      if (vault) {
        const vaultData = vaultDataContext.getVaultData(vault.address);
        const position = morphoHoldings.positions.find(
          (pos) => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
        );

        const vaultAccount: VaultAccount = {
          type: 'vault',
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          balance: position ? BigInt(position.shares) : BigInt(0),
          assetAddress: '', // Will be fetched during transaction
          assetDecimals: vaultData?.assetDecimals ?? 18,
        };

        if (action === 'deposit') {
          // Pre-fill wallet as "from" and vault as "to"
          const walletAccount: WalletAccount = {
            type: 'wallet',
            address: 'wallet',
            symbol: vault.symbol,
            balance: BigInt(0),
          };
          setFromAccount(walletAccount);
          setToAccount(vaultAccount);
        } else if (action === 'withdraw') {
          // Pre-fill vault as "from" and wallet as "to"
          const walletAccount: WalletAccount = {
            type: 'wallet',
            address: 'wallet',
            symbol: vault.symbol,
            balance: BigInt(0),
          };
          setFromAccount(vaultAccount);
          setToAccount(walletAccount);
        }

        // Keep status as 'idle' so user stays on select page and can modify before proceeding
      }
    }
  }, [searchParams, vaultDataContext, morphoHoldings, setFromAccount, setToAccount]);

  // Get vault position for convertToAssets call
  const vaultPosition = fromAccount?.type === 'vault' 
    ? morphoHoldings.positions.find(
        (pos) => pos.vault.address.toLowerCase() === (fromAccount as VaultAccount).address.toLowerCase()
      )
    : null;

  // Use convertToAssets contract call if position.assets is not available
  const { data: withdrawableAssetsBigInt } = useReadContract({
    address: (fromAccount?.type === 'vault' && !vaultPosition?.assets ? (fromAccount as VaultAccount).address : undefined) as `0x${string}`,
    abi: ERC4626_ABI,
    functionName: 'convertToAssets',
    args: vaultPosition && !vaultPosition.assets && fromAccount?.type === 'vault'
      ? [BigInt(vaultPosition.shares)]
      : undefined,
    query: {
      enabled: fromAccount?.type === 'vault' && !!vaultPosition && !vaultPosition.assets,
    },
  });

  // Helper function to get combined ETH + WETH balance for WETH vault deposits
  const getCombinedEthWethBalance = (): number => {
    const ethBal = parseFloat(ethBalance || '0');
    const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
    const wethBal = wethToken ? parseFloat(wethToken.formatted || '0') : 0;
    const gasReserve = ethBal > 0.0001 ? 0.0001 : (ethBal > 0.00005 ? 0.00005 : 0);
    const wrappableEth = ethBal > gasReserve ? ethBal - gasReserve : 0;
    return wethBal + wrappableEth;
  };

  // Helper function to get wallet balance display text
  const getWalletBalanceText = (): string => {
    if (!derivedAsset) return '';
    
    if (toAccount?.type === 'vault') {
      const toVault = toAccount as VaultAccount;
      const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase();
      
      if (isWethVault && (derivedAsset.symbol === 'WETH' || derivedAsset.symbol === 'ETH')) {
        const combinedBal = getCombinedEthWethBalance();
        const ethBal = parseFloat(ethBalance || '0');
        const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
        const wethBal = wethToken ? parseFloat(wethToken.formatted || '0') : 0;
        
        if (wethBal > 0 && ethBal > 0) {
          return `Available: ${formatAvailableBalance(combinedBal, 'WETH')} (${formatAvailableBalance(wethBal, 'WETH')} WETH + ${formatAvailableBalance(ethBal, 'ETH')} wrappable)`;
        } else if (wethBal > 0) {
          return formatAvailableBalance(wethBal, 'WETH');
        } else if (ethBal > 0) {
          return `Available: ${formatAvailableBalance(ethBal, 'ETH')} (wrappable to WETH)`;
        }
        return formatAvailableBalance('0', 'WETH');
      }
    }
    
    if (derivedAsset.symbol === 'ETH' || derivedAsset.symbol === 'WETH') {
      return formatAvailableBalance(ethBalance || '0', derivedAsset.symbol);
    }
    
    const token = tokenBalances.find((t) => t.symbol.toUpperCase() === derivedAsset.symbol.toUpperCase());
    return formatAvailableBalance(token?.formatted || '0', derivedAsset.symbol);
  };

  // Helper function to get vault balance display text
  const getVaultBalanceText = (): string => {
    if (!fromAccount || fromAccount.type !== 'vault' || !derivedAsset) return '';
    
    const vaultAccount = fromAccount as VaultAccount;
    const vaultData = vaultDataContext.getVaultData(vaultAccount.address);
    const position = morphoHoldings.positions.find(
      (pos) => pos.vault.address.toLowerCase() === vaultAccount.address.toLowerCase()
    );

    if (position && vaultData) {
      let assetAmount: number | null = null;
      
      if (position.assets) {
        assetAmount = parseFloat(position.assets) / Math.pow(10, vaultData.assetDecimals || 18);
      } else if (withdrawableAssetsBigInt !== undefined) {
        assetAmount = parseFloat(formatUnits(withdrawableAssetsBigInt, vaultData.assetDecimals || 18));
      }
      
      if (assetAmount !== null) {
        return formatAvailableBalance(assetAmount, derivedAsset.symbol, vaultData.assetDecimals || 18);
      }
    }
    
    return `Available: 0.00 ${derivedAsset.symbol}`;
  };

  // Get max amount as a number for validation
  const getMaxAmount = (): number | null => {
    if (!fromAccount || !derivedAsset) return null;

    if (fromAccount.type === 'wallet') {
      const symbol = derivedAsset.symbol;
      if (toAccount?.type === 'vault') {
        const toVault = toAccount as VaultAccount;
        const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase();
        if (isWethVault && (symbol === 'WETH' || symbol === 'ETH')) {
          return getCombinedEthWethBalance();
        }
      }
      
      if (symbol === 'WETH' || symbol === 'ETH') {
        return parseFloat(ethBalance || '0');
      }
      
      const token = tokenBalances.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
      if (token) {
        return parseFloat(formatUnits(token.balance, token.decimals));
      }
    } else {
      const vaultAccount = fromAccount as VaultAccount;
      const vaultData = vaultDataContext.getVaultData(vaultAccount.address);
      const position = vaultPosition;

      if (position && vaultData) {
        if (position.assets) {
          return parseFloat(position.assets) / Math.pow(10, vaultData.assetDecimals || 18);
        } else if (withdrawableAssetsBigInt !== undefined) {
          return parseFloat(formatUnits(withdrawableAssetsBigInt, vaultData.assetDecimals || 18));
        }
      }
    }
    return null;
  };

  // Calculate max amount for the selected "from" account
  const calculateMaxAmount = () => {
    const maxAmount = getMaxAmount();
    if (maxAmount === null) return;

    if (fromAccount?.type === 'wallet') {
      const symbol = derivedAsset?.symbol || '';
      if (symbol === 'WETH' || symbol === 'ETH') {
        setAmount(maxAmount > 0 ? formatAssetAmountForMax(maxAmount, symbol) : '0');
      } else {
        const token = tokenBalances.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
        if (token) {
          setAmount(formatBigIntForInput(token.balance, token.decimals));
        }
      }
    } else {
      const vaultAccount = fromAccount as VaultAccount;
      const vaultData = vaultDataContext.getVaultData(vaultAccount.address);
      const decimals = vaultData?.assetDecimals || 18;
      setAmount(formatAssetAmountForMax(maxAmount, derivedAsset?.symbol || '', decimals));
    }
  };

  const handleAmountChange = (value: string) => {
    if (value === '') {
      setAmount('');
      return;
    }
    
    if (!/^\d*\.?\d*$/.test(value)) {
      return;
    }
    
    // Validate against max amount
    const maxAmount = getMaxAmount();
    if (maxAmount !== null) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > maxAmount) {
        // Cap the value at max amount
        const decimals = fromAccount?.type === 'vault' 
          ? (fromAccount as VaultAccount).assetDecimals ?? derivedAsset?.decimals ?? 18
          : derivedAsset?.decimals ?? 18;
        setAmount(formatAssetAmountForMax(maxAmount, derivedAsset?.symbol || '', decimals));
        return;
      }
    }
    
    setAmount(value);
  };

  const handleStartTransaction = () => {
    if (fromAccount && toAccount && derivedAsset) {
      setStatus('preview');
    }
  };

  const handleReset = () => {
    reset();
    router.push('/transactions');
  };

  if (!isConnected) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-8 text-center">
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-sm text-[var(--foreground-secondary)]">
            Please connect your wallet to start making transactions.
          </p>
        </div>
      </div>
    );
  }

  const getProgressSteps = () => {
    const baseSteps = [
      { label: 'Select', completed: false, active: false },
      { label: 'Review', completed: false, active: false },
      { label: 'Confirmation', completed: false, active: false }
    ];

    if (status === 'success') {
      return baseSteps.map(step => ({ ...step, completed: true }));
    }
    
    if (status === 'preview') {
      return [
        { ...baseSteps[0], completed: true },
        { ...baseSteps[1], active: true },
        baseSteps[2]
      ];
    }
    
    if (status === 'signing' || status === 'approving' || status === 'confirming') {
      return [
        { ...baseSteps[0], completed: true },
        { ...baseSteps[1], active: true },
        baseSteps[2]
      ];
    }
    
    return [
      { ...baseSteps[0], active: true },
      baseSteps[1],
      baseSteps[2]
    ];
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)] mb-2">
          Transfer Assets
        </h1>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Move assets between your wallet and vaults, or transfer between vaults.
        </p>
      </div>

      {/* Overall Transaction Flow Progress Bar - Always visible */}
      <TransactionProgressBar steps={getProgressSteps()} isSuccess={status === 'success'} />

      {status === 'idle' && (
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6 space-y-6">
          {/* From Account */}
          <AccountSelector
            label="From"
            selectedAccount={fromAccount}
            onSelect={(account) => {
              // If wallet is selected and it's already selected in "to", unselect it from "to"
              if (account?.type === 'wallet' && toAccount?.type === 'wallet') {
                setToAccount(null);
              }
              setFromAccount(account);
            }}
            excludeAccount={toAccount}
            assetSymbol={derivedAsset?.symbol || null}
          />

          {/* To Account */}
          <AccountSelector
            label="To"
            selectedAccount={toAccount}
            onSelect={(account) => {
              // If wallet is selected and it's already selected in "from", unselect it from "from"
              if (account?.type === 'wallet' && fromAccount?.type === 'wallet') {
                setFromAccount(null);
              }
              setToAccount(account);
            }}
            excludeAccount={fromAccount}
            filterByAssetSymbol={fromAccount?.type === 'vault' ? (fromAccount as VaultAccount).symbol : null}
            assetSymbol={derivedAsset?.symbol || null}
          />

          {/* Amount Input */}
          {fromAccount && derivedAsset && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--foreground-secondary)]">
                  Amount ({derivedAsset.symbol})
                </label>
                <button
                  type="button"
                  onClick={calculateMaxAmount}
                  className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)]"
                >
                  MAX
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 pr-24 bg-[var(--background)] border border-[var(--border-subtle)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                {/* Dollar amount display for BTC/ETH vault transactions - inside input */}
                {(() => {
                  if (!fromAccount || !toAccount || !derivedAsset || !amount) return null;
                  
                  const amountNum = parseFloat(amount);
                  if (isNaN(amountNum) || amountNum <= 0) return null;
                  
                  const vaultAddress = (toAccount.type === 'vault' 
                    ? (toAccount as VaultAccount).address 
                    : fromAccount.type === 'vault' 
                    ? (fromAccount as VaultAccount).address 
                    : null)?.toLowerCase();
                  
                  if (!vaultAddress) return null;
                  
                  const btcVaultAddress = VAULTS.cbBTC_VAULT.address.toLowerCase();
                  const wethVaultAddress = VAULTS.WETH_VAULT.address.toLowerCase();
                  const isBtcVault = vaultAddress === btcVaultAddress;
                  const isWethVault = vaultAddress === wethVaultAddress;
                  
                  let price: number | null = null;
                  if (isBtcVault && btcPrice && typeof btcPrice === 'number' && btcPrice > 0) {
                    price = btcPrice;
                  } else if (isWethVault && ethPrice && typeof ethPrice === 'number' && ethPrice > 0) {
                    price = ethPrice;
                  }
                  
                  if (!price) return null;
                  
                  const dollarAmount = amountNum * price;
                  if (isNaN(dollarAmount) || dollarAmount <= 0) return null;
                  
                  return (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <span className="text-sm text-[var(--foreground-muted)]">
                        ≈ ${dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })()}
              </div>
              {fromAccount && derivedAsset && (
                <p className="text-xs text-[var(--foreground-muted)]">
                  {fromAccount.type === 'wallet' ? getWalletBalanceText() : getVaultBalanceText()}
                </p>
              )}
            </div>
          )}

          {/* Validation message */}
          {fromAccount && toAccount && fromAccount.type === 'wallet' && toAccount.type === 'wallet' && (
            <div className="p-4 bg-[var(--warning-subtle)] rounded-lg border border-[var(--warning)]">
              <p className="text-sm text-[var(--foreground)]">
                Wallet-to-wallet transactions are not allowed. Please select a vault for one of the accounts.
              </p>
            </div>
          )}

          {/* Start Transaction Button */}
          <Button
            onClick={handleStartTransaction}
            disabled={
              !fromAccount || 
              !toAccount || 
              !derivedAsset || 
              !amount || 
              parseFloat(amount) <= 0 ||
              (fromAccount.type === 'wallet' && toAccount.type === 'wallet') // Prevent wallet-to-wallet
            }
            variant="primary"
            size="lg"
            fullWidth
          >
            Continue
          </Button>
        </div>
      )}

      {/* Transaction Flow (Preview, Progress, Success, Error) */}
      {(status === 'preview' || status === 'signing' || status === 'approving' || status === 'confirming' || status === 'success' || status === 'error') && (
        <>
          <TransactionFlow
            onSuccess={() => {
              setTimeout(() => {
                handleReset();
              }, 3000);
            }}
          />
          {status !== 'signing' && status !== 'approving' && status !== 'confirming' && (
            <Button
              onClick={handleReset}
              variant="secondary"
              size="lg"
              fullWidth
            >
              {status === 'success' ? 'New Transaction' : 'Start Over'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
