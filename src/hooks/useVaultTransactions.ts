import { useState, useCallback } from 'react';
import { useWalletClient, useAccount, usePublicClient, useReadContract, useBalance } from 'wagmi';
import { 
  setupBundle,
  type InputBundlerOperation,
  type BundlingOptions,
} from '@morpho-org/bundler-sdk-viem';
import { DEFAULT_SLIPPAGE_TOLERANCE } from '@morpho-org/blue-sdk';
import { parseUnits, type Address, getAddress, formatUnits } from 'viem';
import { useVaultData } from '../contexts/VaultDataContext';
import { useVaultSimulationState } from './useVaultSimulationState';
import { useTransactionModal } from '../contexts/TransactionModalContext';
import { BASE_WETH_ADDRESS, GAS_RESERVE_ETH } from '../lib/constants';

// ABI for vault asset() function and ERC-4626 conversion functions
const VAULT_ASSET_ABI = [
  {
    inputs: [],
    name: "asset",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    name: 'convertToShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ERC20 ABI for balanceOf (vault shares are ERC20 tokens)
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type VaultAction = 'deposit' | 'withdraw' | 'withdrawAll';

export type TransactionProgressStep = 
  | { type: 'signing'; stepIndex: number; totalSteps: number; stepLabel: string }
  | { type: 'approving'; stepIndex: number; totalSteps: number; stepLabel: string; contractAddress: string; txHash?: string }
  | { type: 'confirming'; stepIndex: number; totalSteps: number; stepLabel: string; txHash: string };

export type TransactionProgressCallback = (step: TransactionProgressStep) => void;

export function useVaultTransactions(vaultAddress?: string) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address: accountAddress } = useAccount();
  const vaultDataContext = useVaultData();
  const { modalState } = useTransactionModal();
  const [isLoading, setIsLoading] = useState(false);
  
  // Use vault address from modal state if available, otherwise use prop
  const activeVaultAddress = modalState.vaultAddress || vaultAddress;
  const checksummedVaultAddress = activeVaultAddress ? getAddress(activeVaultAddress) : undefined;
  
  // Only enable simulation state when modal is open to reduce RPC calls
  // The state will load quickly enough when user opens the modal
  const shouldEnableSimulation = modalState.isOpen && !!checksummedVaultAddress;
  
  const { 
    simulationState, 
    isPending: isSimulationPending, 
    error: simulationError, 
    bundler 
  } = useVaultSimulationState(
    checksummedVaultAddress,
    shouldEnableSimulation
  );

  const vaultData = checksummedVaultAddress ? vaultDataContext.getVaultData(checksummedVaultAddress) : null;
  const assetDecimals = vaultData?.assetDecimals ?? 18;

  // Fetch asset address from vault contract
  const { data: assetAddress } = useReadContract({
    address: checksummedVaultAddress as Address,
    abi: VAULT_ASSET_ABI,
    functionName: "asset",
    query: { enabled: !!checksummedVaultAddress },
  });

  // Get user's ETH balance to reserve gas when wrapping
  const { data: ethBalance } = useBalance({
    address: accountAddress as `0x${string}`,
    query: { enabled: !!accountAddress },
  });

  // Get user's WETH balance (for WETH vaults - can deposit existing WETH directly)
  const { data: wethBalance } = useReadContract({
    address: assetAddress as Address,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: accountAddress ? [accountAddress as Address] : undefined,
    query: { enabled: !!accountAddress && !!assetAddress && assetAddress?.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase() },
  });

  const executeVaultAction = useCallback(async (
    action: VaultAction,
    vault: string,
    amount?: string,
    onProgress?: TransactionProgressCallback
  ): Promise<string> => {
    if (!accountAddress) throw new Error('Wallet not connected');
    if (!walletClient?.account?.address) throw new Error('Wallet client not available');
    if (!simulationState) throw new Error('Simulation state not ready');
    if (!bundler) throw new Error('Bundler not available');
    if (isSimulationPending) {
      throw new Error('Simulation state is still loading. Please wait a moment and try again.');
    }
    
    // Additional check: ensure simulation state has data
    if (!simulationState.vaults || Object.keys(simulationState.vaults).length === 0) {
      throw new Error('Simulation state vaults not loaded. Please wait and try again.');
    }

    setIsLoading(true);

    try {
      const normalizedVault = getAddress(vault);
      const userAddress = walletClient.account.address as Address;

      // Check if this is a WETH vault (Using case-insensitive comparison)
      const isWethVault = assetAddress?.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase();

      // Verify vault exists in simulation state
      const vaultKeys = simulationState.vaults ? Object.keys(simulationState.vaults) : [];
      const vaultExists = vaultKeys.some(key => 
        getAddress(key).toLowerCase() === normalizedVault.toLowerCase()
      );
      
      if (!vaultExists) {
        throw new Error(
          `Vault ${normalizedVault} not found in simulation state. ` +
          `Available vaults: ${vaultKeys.map(k => getAddress(k)).join(', ') || 'none'}. ` +
          `Please wait for the simulation state to finish loading.`
        );
      }

      // Determine amount
      let amountBigInt: bigint;
      let useSharesForWithdraw = false;
      
      if (action === 'withdrawAll') {
        // For withdrawAll, get the user's actual share balance from the vault contract
        // Vault shares are ERC20 tokens, so we can use balanceOf
        if (!publicClient) {
          throw new Error('Public client not available');
        }
        
        const userShares = await publicClient.readContract({
          address: normalizedVault,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        });
        
        if (userShares === BigInt(0)) {
          throw new Error('No shares to withdraw');
        }
        
        amountBigInt = userShares;
        useSharesForWithdraw = true;
      } else if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Invalid amount');
      } else {
        // Sanitize and validate amount string before parsing
        // Remove any whitespace and ensure it's a valid decimal number
        const sanitizedAmount = amount.trim().replace(/\s+/g, '');
        
        // Validate format: must be a valid decimal number (no scientific notation, no extra characters)
        if (!/^\d+\.?\d*$/.test(sanitizedAmount)) {
          throw new Error(`Invalid amount format: "${amount}". Expected a decimal number.`);
        }
        
        // Split into integer and decimal parts
        const parts = sanitizedAmount.split('.');
        const integerPart = parts[0] || '0';
        const decimalPart = parts[1] || '';
        
        // Ensure decimal part doesn't exceed contract decimals
        if (decimalPart.length > assetDecimals) {
          // Truncate to contract decimals (don't round to prevent exceeding balance)
          const truncatedDecimal = decimalPart.substring(0, assetDecimals);
          const truncatedAmount = `${integerPart}.${truncatedDecimal}`;
          amountBigInt = parseUnits(truncatedAmount, assetDecimals);
        } else {
          // Pad decimal part with zeros if needed (parseUnits requires exact decimal places)
          const paddedDecimal = decimalPart.padEnd(assetDecimals, '0');
          const normalizedAmount = `${integerPart}.${paddedDecimal}`;
          amountBigInt = parseUnits(normalizedAmount, assetDecimals);
        }
      }

      // Build input operations
      const inputOperations: InputBundlerOperation[] = [];

      if (action === 'deposit') {
        if (isWethVault) {
          // --- SPECIAL FLOW FOR WETH VAULTS ---
          // Can deposit both existing WETH and wrap ETH as needed
          const existingWeth = (wethBalance as bigint) || BigInt(0);
          const availableEth = ethBalance?.value || BigInt(0);
          
          // Reserve ETH for gas fees
          const GAS_RESERVE = parseUnits(GAS_RESERVE_ETH, 18);
          
          // Calculate how much ETH we can wrap (available ETH minus gas reserve)
          const maxWrapAmount = availableEth > GAS_RESERVE 
            ? availableEth - GAS_RESERVE 
            : BigInt(0);
          
          // Total available: existing WETH + wrappable ETH
          const totalAvailable = existingWeth + maxWrapAmount;
          
          if (amountBigInt > totalAvailable) {
            throw new Error(
              `Insufficient balance. Available: ${formatUnits(totalAvailable, 18)} WETH ` +
              `(${formatUnits(existingWeth, 18)} WETH + ${formatUnits(maxWrapAmount, 18)} ETH wrappable). ` +
              `Requested: ${formatUnits(amountBigInt, 18)} WETH`
            );
          }
          
          // Determine how much ETH to wrap
          const ethToWrap = amountBigInt > existingWeth ? amountBigInt - existingWeth : BigInt(0);
          
          // If we need to wrap ETH, add wrap operation
          if (ethToWrap > BigInt(0)) {
            if (ethToWrap > maxWrapAmount) {
              throw new Error(
                `Cannot wrap ${formatUnits(ethToWrap, 18)} ETH. ` +
                `Need at least ${formatUnits(GAS_RESERVE, 18)} ETH for gas fees. ` +
                `Available to wrap: ${formatUnits(maxWrapAmount, 18)} ETH`
              );
            }
            
            // Wrap Native ETH into WETH
            inputOperations.push({
              type: 'Erc20_Wrap',
              address: BASE_WETH_ADDRESS,
              sender: userAddress,
              args: {
                amount: ethToWrap,
                owner: userAddress,
              },
            });
          }
          
          // Deposit WETH into Vault (will use existing WETH + newly wrapped WETH)
          inputOperations.push({
            type: 'MetaMorpho_Deposit',
            address: normalizedVault,
            sender: userAddress,
            args: {
              assets: amountBigInt, // Total amount to deposit
              owner: userAddress,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          });
        } else {
          // --- STANDARD FLOW (USDC, BTC, etc) ---
          inputOperations.push({
            type: 'MetaMorpho_Deposit',
            address: normalizedVault,
            sender: userAddress,
            args: {
              assets: amountBigInt,
              owner: userAddress,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          });
        }
      } else if (action === 'withdraw' || action === 'withdrawAll') {
        // Use shares parameter for withdrawAll, assets for regular withdraw
        if (useSharesForWithdraw) {
          inputOperations.push({
            type: 'MetaMorpho_Withdraw',
            address: normalizedVault,
            sender: userAddress,
            args: {
              shares: amountBigInt, // Use actual user shares
              owner: userAddress,
              receiver: userAddress,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          });
        } else {
          // Convert assets to shares to avoid SDK's incorrect decimal assumption
          // The SDK's MetaMorpho_Withdraw with assets parameter assumes 18 decimals,
          // but some assets (like cbBTC) use 8 decimals. By converting to shares ourselves,
          // we ensure the correct conversion using the vault's convertToShares function.
          if (!publicClient) {
            throw new Error('Public client not available');
          }
          
          let sharesBigInt: bigint;
          try {
            sharesBigInt = await publicClient.readContract({
              address: normalizedVault,
              abi: VAULT_ASSET_ABI,
              functionName: 'convertToShares',
              args: [amountBigInt],
            });
          } catch {
            throw new Error('Failed to convert assets to shares. Please try again.');
          }
          
          inputOperations.push({
            type: 'MetaMorpho_Withdraw',
            address: normalizedVault,
            sender: userAddress,
            args: {
              shares: sharesBigInt, // Use converted shares instead of assets
              owner: userAddress,
              receiver: userAddress,
              slippage: DEFAULT_SLIPPAGE_TOLERANCE,
            },
          });
        }

        // Optional: Add 'Erc20_Unwrap' here if you want automatic unwrapping on withdraw
      }

      // Configure bundling options
      const bundlingOptions: BundlingOptions = {
        publicAllocatorOptions: {
          enabled: true,
        },
        // We do not need getRequirementOperations because we manually handled the wrapping above
      };
      
      // setupBundle handles:
      // 1. Token approvals (if needed)
      // 2. Operation optimization and encoding
      // Type assertion is safe here because we've validated simulationState has required properties
      if (!simulationState || typeof simulationState !== 'object') {
        throw new Error('Simulation state is invalid');
      }
      const { bundle } = setupBundle(
        inputOperations,
        simulationState as Parameters<typeof setupBundle>[1],
        userAddress, // receiver
        {
          ...bundlingOptions,
          supportsSignature: false,
        }
      );

      // Calculate total steps dynamically based on actual requirements
      const signatureCount = bundle.requirements.signatures.length;
      const prerequisiteTxCount = bundle.requirements.txs.length;
      const totalSteps = signatureCount + prerequisiteTxCount + 1; // Each signature + each prerequisite tx + main tx
      let currentStepIndex = 0;

      // Sign any required signatures - each signature is its own step
      for (let i = 0; i < signatureCount; i++) {
        const signature = bundle.requirements.signatures[i];
        const stepLabel = signatureCount > 1 ? `Sign ${i + 1}/${signatureCount}` : 'Sign';
        
        // Call progress callback - wallet will open for signing
        onProgress?.({ 
          type: 'signing', 
          stepIndex: currentStepIndex, 
          totalSteps,
          stepLabel 
        });
        
        await signature.sign(walletClient, walletClient.account);
        
        // After signing completes, move to next step
        currentStepIndex++;
      }
      
      // Send prerequisite transactions - each transaction is its own step
      for (let i = 0; i < prerequisiteTxCount; i++) {
        const prereqTx = bundle.requirements.txs[i];
        const contractAddress = prereqTx.tx.to || '';
        const stepLabel = prerequisiteTxCount > 1 
          ? `Approve ${i + 1}/${prerequisiteTxCount}` 
          : 'Approve';
        
        // Call progress callback BEFORE sending - wallet will open for approval
        onProgress?.({ 
          type: 'approving', 
          stepIndex: currentStepIndex, 
          totalSteps,
          stepLabel,
          contractAddress 
        });
        
        // Wallet opens here for approval transaction
        const prereqHash = await walletClient.sendTransaction({
          ...prereqTx.tx,
          account: walletClient.account,
        });
        
        // Notify about approval transaction hash
        onProgress?.({ 
          type: 'approving', 
          stepIndex: currentStepIndex, 
          totalSteps,
          stepLabel,
          contractAddress,
          txHash: prereqHash
        });
        
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: prereqHash });
        }
        
        // After each prerequisite transaction, wait a moment for state to propagate
        if (i < prerequisiteTxCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        currentStepIndex++;
      }
      
      // Final wait after all prerequisite transactions
      if (prerequisiteTxCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Send the main bundle transaction
      const bundleTx = bundle.tx();
      
      // For bundler 3, the transaction should be sent to the bundler contract
      if (!bundleTx.to) {
        throw new Error('Bundle transaction missing "to" address');
      }

      // Estimate gas first
      let gasEstimate: bigint | undefined;
      if (publicClient && walletClient.account) {
        try {
          gasEstimate = await publicClient.estimateGas({
            account: walletClient.account,
            to: bundleTx.to,
            data: bundleTx.data,
            value: bundleTx.value || BigInt(0),
          });
        } catch (gasError: unknown) {
          // If we had prerequisite transactions and gas estimation fails with an allowance error,
          // it might be because the state hasn't propagated yet. Try recreating the bundle.
          const errorString = gasError instanceof Error ? gasError.message : String(gasError);
          const isAllowanceError = errorString.toLowerCase().includes('allowance') || 
                                   errorString.toLowerCase().includes('transfer amount exceeds');
          
          if (prerequisiteTxCount > 0 && isAllowanceError) {
            // Wait a bit longer for state to propagate, then recreate bundle
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Recreate the bundle with updated simulation state
            const { bundle: refreshedBundle } = setupBundle(
              inputOperations,
              simulationState,
              userAddress,
              {
                ...bundlingOptions,
                supportsSignature: false,
              }
            );
            
            const refreshedBundleTx = refreshedBundle.tx();
            if (refreshedBundleTx.to) {
              try {
                gasEstimate = await publicClient.estimateGas({
                  account: walletClient.account,
                  to: refreshedBundleTx.to,
                  data: refreshedBundleTx.data,
                  value: refreshedBundleTx.value || BigInt(0),
                });
                // Use the refreshed bundle transaction
                const refreshedTxHash = await walletClient.sendTransaction({
                  to: refreshedBundleTx.to,
                  data: refreshedBundleTx.data,
                  value: refreshedBundleTx.value || BigInt(0),
                  account: walletClient.account,
                  gas: gasEstimate,
                });
                return refreshedTxHash;
              } catch {
                // If retry still fails, proceed without gas estimate
              }
            }
          }
          // Proceed without gas estimate - wallet will estimate
        }
      }

      // Notify that we're about to send the main transaction - wallet will open
      onProgress?.({ 
        type: 'confirming', 
        stepIndex: currentStepIndex, 
        totalSteps,
        stepLabel: 'Confirm',
        txHash: '' // Will be updated after sending
      });

      // Wallet opens here for main transaction
      const txHash = await walletClient.sendTransaction({
        to: bundleTx.to,
        data: bundleTx.data,
        value: bundleTx.value || BigInt(0),
        account: walletClient.account,
        gas: gasEstimate,
      });

      // Update progress with actual txHash after transaction is sent
      onProgress?.({ 
        type: 'confirming', 
        stepIndex: currentStepIndex, 
        totalSteps,
        stepLabel: 'Confirm',
        txHash 
      });

      return txHash;
    } catch (error) {
      // Error is handled by error state
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [
    walletClient, 
    publicClient,
    bundler, 
    assetDecimals,
    accountAddress,
    simulationState,
    isSimulationPending,
    assetAddress,
    ethBalance,
    wethBalance
  ]);

  return {
    executeVaultAction,
    isLoading: isLoading || isSimulationPending,
    error: simulationError 
  };
}