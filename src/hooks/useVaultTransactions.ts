import { useState, useCallback } from 'react';
import { useWalletClient, useAccount, usePublicClient, useReadContract } from 'wagmi';
import { 
  setupBundle,
  type InputBundlerOperation,
  type BundlingOptions,
} from '@morpho-org/bundler-sdk-viem';
import { DEFAULT_SLIPPAGE_TOLERANCE } from '@morpho-org/blue-sdk';
import { parseUnits, type Address, getAddress, formatUnits } from 'viem';
import { useVaultData } from '../contexts/VaultDataContext';
import { useVaultSimulationState } from './useVaultSimulationState';
import { BASE_WETH_ADDRESS } from '../lib/constants';
import { getVaultVersion } from '../lib/vault-utils';
import { ERC20_BALANCE_ABI } from '../lib/abis';

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


type VaultAction = 'deposit' | 'withdraw' | 'withdrawAll' | 'transfer';

export type TransactionProgressStep = 
  | { type: 'signing'; stepIndex: number; totalSteps: number; stepLabel: string }
  | { type: 'approving'; stepIndex: number; totalSteps: number; stepLabel: string; contractAddress: string; txHash?: string }
  | { type: 'confirming'; stepIndex: number; totalSteps: number; stepLabel: string; txHash: string };

export type TransactionProgressCallback = (step: TransactionProgressStep) => void;

export function useVaultTransactions(vaultAddress?: string, enabled: boolean = true) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address: accountAddress } = useAccount();
  const vaultDataContext = useVaultData();
  const [isLoading, setIsLoading] = useState(false);
  
  // Use provided vault address
  const checksummedVaultAddress = vaultAddress ? getAddress(vaultAddress) : undefined;
  
  // Enable simulation state when enabled and vault address is provided
  const shouldEnableSimulation = enabled && !!checksummedVaultAddress;
  
  const { 
    simulationState: currentSimulationState, 
    isPending: isSimulationPending, 
    error: simulationError, 
    bundler,
    refetch: refetchSimulationState
  } = useVaultSimulationState(
    checksummedVaultAddress,
    shouldEnableSimulation
  );

  const vaultData = checksummedVaultAddress ? vaultDataContext.getVaultData(checksummedVaultAddress) : null;

  // Fetch asset address from vault contract
  const { data: assetAddress } = useReadContract({
    address: checksummedVaultAddress as Address,
    abi: VAULT_ASSET_ABI,
    functionName: "asset",
    query: { enabled: !!checksummedVaultAddress },
  });

  const executeVaultAction = useCallback(async (
    action: VaultAction,
    vault: string,
    amount?: string,
    onProgress?: TransactionProgressCallback,
    destinationVault?: string, // For transfer operations
    assetDecimalsOverride?: number, // Override asset decimals from selected asset
    preferredAsset?: 'ETH' | 'WETH' | 'ALL' // For WETH vault deposits/withdrawals ('ALL' means use both ETH+WETH)
  ): Promise<string> => {
    if (!accountAddress) {
      throw new Error('Wallet not connected.\n\nPlease connect your wallet and try again.');
    }
    if (!walletClient?.account?.address) {
      throw new Error('Wallet client not available.\n\nPlease ensure your wallet is connected and try again.');
    }
    if (!currentSimulationState) {
      throw new Error('Transaction system not ready.\n\nPlease wait a moment for the system to initialize and try again.');
    }
    if (!bundler) {
      throw new Error('Transaction bundler not available.\n\nPlease wait a moment and try again.');
    }
    if (isSimulationPending) {
      throw new Error('Transaction system is still loading.\n\nPlease wait a moment for the system to prepare and try again.');
    }
    
    // Determine vault version to check the correct array
    const vaultVersion = getVaultVersion(vault);
    
    // Additional check: ensure simulation state has data for the correct vault type
    const normalizedVault = getAddress(vault);
    if (vaultVersion === 'v2') {
      // For v2 vaults, check vaultV2s
      const v2Vaults = currentSimulationState.vaultV2s || {};
      const vaultKeys = Object.keys(v2Vaults);
      const vaultExists = vaultKeys.some(key => 
        getAddress(key).toLowerCase() === normalizedVault.toLowerCase()
      );
      
      if (vaultKeys.length === 0) {
        throw new Error('Vault data not loaded.\n\nPlease wait for the vault information to load and try again.');
      }
      
      if (!vaultExists) {
        throw new Error(
          `Vault ${normalizedVault} not found in simulation state. ` +
          `Available v2 vaults: ${vaultKeys.map(k => getAddress(k)).join(', ') || 'none'}. ` +
          `Please wait for the simulation state to finish loading.`
        );
      }
    } else {
      // For v1 vaults, check vaults
      const v1Vaults = currentSimulationState.vaults || {};
      const vaultKeys = Object.keys(v1Vaults);
      const vaultExists = vaultKeys.some(key => 
        getAddress(key).toLowerCase() === normalizedVault.toLowerCase()
      );
      
      if (vaultKeys.length === 0) {
        throw new Error('Vault data not loaded.\n\nPlease wait for the vault information to load and try again.');
      }
      
      if (!vaultExists) {
        throw new Error(
          `Vault ${normalizedVault} not found in simulation state. ` +
          `Available v1 vaults: ${vaultKeys.map(k => getAddress(k)).join(', ') || 'none'}. ` +
          `Please wait for the simulation state to finish loading.`
        );
      }
    }

    setIsLoading(true);

    // Refetch simulation state before executing to ensure we have fresh on-chain data
    // This prevents "execution reverted" errors caused by stale simulation state
    // The refetch function returns the fresh simulation state directly, avoiding race conditions
    let simulationState = currentSimulationState;
    try {
      if (refetchSimulationState) {
        const freshState = await refetchSimulationState();
        if (freshState) {
          simulationState = freshState;
        }
      }
    } catch {
      // Continue with cached state - it's better than failing completely
    }
    
    // Re-validate simulation state after refetch
    if (vaultVersion === 'v2') {
      // For v2 vaults, check vaultV2s
      if (!simulationState || !simulationState.vaultV2s || Object.keys(simulationState.vaultV2s).length === 0) {
        throw new Error('Vault data not loaded after refresh.\n\nPlease wait for the vault information to load and try again.');
      }
    } else {
      // For v1 vaults, check vaults
      if (!simulationState || !simulationState.vaults || Object.keys(simulationState.vaults).length === 0) {
        throw new Error('Vault data not loaded after refresh.\n\nPlease wait for the vault information to load and try again.');
      }
    }

    try {
      const userAddress = walletClient.account.address as Address;

      // Check if this is a WETH vault (Using case-insensitive comparison)
      const isWethVault = assetAddress?.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase();

      // Vault existence already verified above, but double-check after refetch
      const vaultKeys = vaultVersion === 'v2' 
        ? (simulationState.vaultV2s ? Object.keys(simulationState.vaultV2s) : [])
        : (simulationState.vaults ? Object.keys(simulationState.vaults) : []);
      const vaultExists = vaultKeys.some(key => 
        getAddress(key).toLowerCase() === normalizedVault.toLowerCase()
      );
      
      if (!vaultExists) {
        throw new Error(
          `Vault ${normalizedVault} not found in simulation state after refresh. ` +
          `Available ${vaultVersion === 'v2' ? 'v2' : 'v1'} vaults: ${vaultKeys.map(k => getAddress(k)).join(', ') || 'none'}. ` +
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
        // Use asset decimals override if provided, otherwise fall back to vault data
        const effectiveAssetDecimals = assetDecimalsOverride ?? vaultData?.assetDecimals ?? 18;
        
        // Sanitize and validate amount string before parsing
        // Remove any whitespace and ensure it's a valid decimal number
        let sanitizedAmount = amount.trim().replace(/\s+/g, '');
        
        // Normalize: if amount starts with decimal point, prepend "0"
        // This allows inputs like ".00003" to be valid
        if (sanitizedAmount.startsWith('.')) {
          sanitizedAmount = '0' + sanitizedAmount;
        }
        
        // Validate format: must be a valid decimal number (no scientific notation, no extra characters)
        // Allows: "123", "123.456", "0.123", ".123" (normalized to "0.123")
        if (!/^\d+\.?\d*$/.test(sanitizedAmount)) {
          throw new Error(`Invalid amount format: "${amount}". Expected a decimal number.`);
        }
        
        // Split into integer and decimal parts
        const parts = sanitizedAmount.split('.');
        const integerPart = parts[0] || '0';
        const decimalPart = parts[1] || '';
        
        // Ensure decimal part doesn't exceed contract decimals
        if (decimalPart.length > effectiveAssetDecimals) {
          // Truncate to contract decimals (don't round to prevent exceeding balance)
          const truncatedDecimal = decimalPart.substring(0, effectiveAssetDecimals);
          const truncatedAmount = `${integerPart}.${truncatedDecimal}`;
          amountBigInt = parseUnits(truncatedAmount, effectiveAssetDecimals);
        } else {
          // Pad decimal part with zeros if needed (parseUnits requires exact decimal places)
          const paddedDecimal = decimalPart.padEnd(effectiveAssetDecimals, '0');
          const normalizedAmount = `${integerPart}.${paddedDecimal}`;
          amountBigInt = parseUnits(normalizedAmount, effectiveAssetDecimals);
        }
      }

      // Build input operations
      const inputOperations: InputBundlerOperation[] = [];

      if (action === 'transfer' && destinationVault) {
        // Vault-to-vault transfer: withdraw from source vault, deposit to destination vault
        const destVault = getAddress(destinationVault);
        
        // First, withdraw from source vault
        // Convert assets to shares for withdrawal
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
        
        // Withdraw from source vault
        inputOperations.push({
          type: 'MetaMorpho_Withdraw',
          address: normalizedVault,
          sender: userAddress,
          args: {
            shares: sharesBigInt,
            owner: userAddress,
            receiver: userAddress, // Withdraw to wallet first, then deposit
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        });
        
        // Then deposit to destination vault
        inputOperations.push({
          type: 'MetaMorpho_Deposit',
          address: destVault,
          sender: userAddress,
          args: {
            assets: amountBigInt, // Use the same asset amount
            owner: userAddress,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        });
      } else if (action === 'deposit') {
        if (isWethVault) {
          // --- SPECIAL FLOW FOR WETH VAULTS ---
          // Can deposit both existing WETH and wrap ETH as needed
          // We handle wrapping manually (rather than via getRequirementOperations) to:
          // 1. Provide clear error messages about available balances
          // 2. Have full control over the wrapping logic
          // Note: All ETH can be wrapped since USDC can be used for gas on Base
          
          // Fetch fresh balances at transaction time to ensure accuracy
          // Using publicClient ensures we get the state at the moment the button was clicked
          if (!publicClient || !accountAddress) {
            throw new Error('Public client not available');
          }
          
          // Fetch WETH balance directly from contract
          const existingWeth = await publicClient.readContract({
            address: BASE_WETH_ADDRESS,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [accountAddress as Address],
          }) as bigint;
          
          // Fetch fresh ETH balance
          const availableEth = await publicClient.getBalance({
            address: accountAddress as Address,
          });
          
          // Respect preferredAsset selection
          const assetPreference = preferredAsset || 'ALL';
          let ethToWrap: bigint = BigInt(0);
          
          if (assetPreference === 'ETH') {
            // Only use ETH - must wrap all of it
            const availableFormatted = formatUnits(availableEth, 18);
            
            if (amountBigInt > availableEth) {
              throw new Error(
                `Insufficient ETH balance.\n\n` +
                `Requested: ${formatUnits(amountBigInt, 18)} ETH\n` +
                `Available: ${availableFormatted} ETH\n\n` +
                `Please reduce the amount or add more ETH to your wallet.`
              );
            }
            
            // Wrap all requested ETH
            ethToWrap = amountBigInt;
            
          } else if (assetPreference === 'WETH') {
            // Only use existing WETH - no wrapping
            const availableFormatted = formatUnits(existingWeth, 18);
            
            if (amountBigInt > existingWeth) {
              throw new Error(
                `Insufficient WETH balance.\n\n` +
                `Requested: ${formatUnits(amountBigInt, 18)} WETH\n` +
                `Available: ${availableFormatted} WETH\n\n` +
                `Please reduce the amount or add more WETH to your wallet.`
              );
            }
            
            // No wrapping needed - use existing WETH only
            ethToWrap = BigInt(0);
            
          } else {
            // ALL: Use both ETH + WETH (default behavior)
            const totalAvailable = existingWeth + availableEth;
            const availableFormatted = formatUnits(totalAvailable, 18);
            
            if (amountBigInt > totalAvailable) {
              throw new Error(
                `Insufficient balance for WETH vault deposit.\n\n` +
                `Requested: ${formatUnits(amountBigInt, 18)} WETH\n` +
                `Available: ${availableFormatted} WETH\n\n` +
                `Breakdown:\n` +
                `  • Existing WETH: ${formatUnits(existingWeth, 18)} WETH\n` +
                `  • Wrappable ETH: ${formatUnits(availableEth, 18)} ETH\n\n` +
                `Please reduce the amount or add more funds to your wallet.`
              );
            }
            
            // Determine how much ETH to wrap (only what's needed after using existing WETH)
            ethToWrap = amountBigInt > existingWeth ? amountBigInt - existingWeth : BigInt(0);
          }
          
          // If we need to wrap ETH, add wrap operation
          if (ethToWrap > BigInt(0)) {
            if (ethToWrap > availableEth) {
              const ethToWrapFormatted = formatUnits(ethToWrap, 18);
              throw new Error(
                `Cannot wrap ${ethToWrapFormatted} ETH.\n\n` +
                `Available ETH: ${formatUnits(availableEth, 18)} ETH\n` +
                `ETH needed to wrap: ${ethToWrapFormatted} ETH\n\n` +
                `Please reduce the amount or add more ETH to your wallet.`
              );
            }
            
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
        }
        
        // Deposit into vault (for both WETH and standard vaults)
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
      } else if (action === 'withdraw' || action === 'withdrawAll') {
        // Use shares parameter for withdrawAll, assets for regular withdraw
        if (useSharesForWithdraw) {
          // For withdrawAll, we already have userShares from earlier validation
          // No need to validate again - we know userShares > 0
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
          // For regular withdraw, validate balance before attempting transaction
          if (!publicClient) {
            throw new Error('Public client not available');
          }
          
          // Get user's actual share balance to validate
          const userShares = await publicClient.readContract({
            address: normalizedVault,
            abi: ERC20_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [userAddress],
          }) as bigint;
          
          // Convert requested assets to shares
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
          
          // Validate user has enough shares
          if (sharesBigInt > userShares) {
            const effectiveAssetDecimals = vaultData?.assetDecimals ?? 18;
            const requestedAssetsFormatted = formatUnits(amountBigInt, effectiveAssetDecimals);
            
            // Convert user's shares to assets for display
            let availableAssetsFormatted: string;
            try {
              const availableAssets = await publicClient.readContract({
                address: normalizedVault,
                abi: [
                  {
                    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
                    name: 'convertToAssets',
                    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
                    stateMutability: 'view',
                    type: 'function',
                  },
                ],
                functionName: 'convertToAssets',
                args: [userShares],
              }) as bigint;
              availableAssetsFormatted = formatUnits(availableAssets, effectiveAssetDecimals);
            } catch {
              // Fallback: show shares if conversion fails
              const sharesFormatted = formatUnits(userShares, 18);
              availableAssetsFormatted = `${sharesFormatted} shares`;
            }
            
            const vaultSymbol = vaultData?.symbol || 'assets';
            throw new Error(
              `Insufficient balance for vault withdrawal.\n\n` +
              `Requested: ${requestedAssetsFormatted} ${vaultSymbol}\n` +
              `Available: ${availableAssetsFormatted} ${vaultSymbol}\n\n` +
              `Please reduce the amount or deposit more funds to the vault.`
            );
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
        
        // Add WETH unwrap operation to bundle if withdrawing to ETH
        // IMPORTANT: Add unwrap AFTER withdrawal so it executes after WETH is received
        // Use isWethVault which is already defined earlier in this function scope (line 182)
        if (isWethVault && preferredAsset === 'ETH') {
          // For withdrawAll, we need to calculate the asset amount that will be withdrawn
          // For regular withdraw, we already have amountBigInt
          let wethAmountToUnwrap: bigint;
          
          if (action === 'withdrawAll') {
            // For withdrawAll, amountBigInt contains the user's share balance
            // We need to convert shares to assets to know how much WETH will be withdrawn
            if (!publicClient) {
              throw new Error('Public client not available');
            }
            
            try {
              const assetsFromShares = await publicClient.readContract({
                address: normalizedVault,
                abi: [
                  {
                    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
                    name: 'convertToAssets',
                    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
                    stateMutability: 'view',
                    type: 'function',
                  },
                ],
                functionName: 'convertToAssets',
                args: [amountBigInt], // amountBigInt contains shares for withdrawAll
              }) as bigint;
              wethAmountToUnwrap = assetsFromShares;
            } catch {
              // If conversion fails, skip unwrap (shouldn't happen, but be safe)
              wethAmountToUnwrap = BigInt(0);
            }
          } else {
            // For regular withdraw, amountBigInt is already the asset amount
            wethAmountToUnwrap = amountBigInt;
          }
          
          // Only add unwrap operation if we have a valid amount
          if (wethAmountToUnwrap > BigInt(0)) {
            // Add unwrap operation BEFORE withdrawal so it executes after withdrawal in the bundle
            // The bundler will optimize the order, but we want unwrap to happen after WETH is received
            inputOperations.push({
              type: 'Erc20_Unwrap',
              address: BASE_WETH_ADDRESS,
              sender: userAddress,
              args: {
                amount: wethAmountToUnwrap,
                receiver: userAddress,
              },
            });
            // The unwrap operation is now part of the bundle and will execute atomically with the withdrawal
          }
        }
      }

      // Configure bundling options
      // Note: We handle WETH wrapping manually (see deposit flow above) rather than via
      // getRequirementOperations to provide better error messages and control.
      // The bundler SDK will still automatically handle token approvals and other requirements.
      const bundlingOptions: BundlingOptions = {
        publicAllocatorOptions: {
          enabled: true,
        },
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
        const stepLabel = signatureCount > 1 
          ? `Pre authorize ${i + 1}/${signatureCount}` 
          : 'Pre authorize';
        
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
        // Use more descriptive labels for prerequisite transactions (approvals, resets, etc.)
        // These are different from signatures - they're actual on-chain transactions
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
          // waitForTransactionReceipt already ensures state propagation on-chain
          await publicClient.waitForTransactionReceipt({ hash: prereqHash });
        }
        
        currentStepIndex++;
      }

      // Send the main bundle transaction
      const bundleTx = bundle.tx();
      
      // For bundler 3, the transaction should be sent to the bundler contract
      if (!bundleTx.to) {
        throw new Error('Bundle transaction missing "to" address');
      }


      // Notify that we're about to send the main transaction - wallet will open
      // Use appropriate label based on action
      const mainTxLabel = action === 'deposit' ? 'Deposit' : 
                         action === 'withdraw' || action === 'withdrawAll' ? 'Withdraw' : 
                         'Transfer';
      onProgress?.({ 
        type: 'confirming', 
        stepIndex: currentStepIndex, 
        totalSteps,
        stepLabel: mainTxLabel,
        txHash: '' // Will be updated after sending
      });

      // Wallet opens here for main transaction
      // Let the wallet handle gas estimation - it's more reliable and handles edge cases better
      const txHash = await walletClient.sendTransaction({
        to: bundleTx.to,
        data: bundleTx.data,
        value: bundleTx.value || BigInt(0),
        account: walletClient.account,
      });

      // Update progress with actual txHash after transaction is sent
      onProgress?.({ 
        type: 'confirming', 
        stepIndex: currentStepIndex, 
        totalSteps,
        stepLabel: mainTxLabel,
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
    accountAddress,
    currentSimulationState,
    isSimulationPending,
    assetAddress,
    refetchSimulationState,
    vaultData
  ]);

  return {
    executeVaultAction,
    isLoading: isLoading || isSimulationPending,
    error: simulationError 
  };
}