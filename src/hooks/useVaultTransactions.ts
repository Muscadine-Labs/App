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
import { BASE_WETH_ADDRESS } from '../lib/constants';

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
  // Use override if provided, otherwise fall back to vault data
  const getAssetDecimals = (override?: number) => override ?? vaultData?.assetDecimals ?? 18;

  // Fetch asset address from vault contract
  const { data: assetAddress } = useReadContract({
    address: checksummedVaultAddress as Address,
    abi: VAULT_ASSET_ABI,
    functionName: "asset",
    query: { enabled: !!checksummedVaultAddress },
  });

  // Check if this is a WETH vault by address (more reliable than waiting for assetAddress)
  // WETH vault address: 0x21e0d366272798da3A977FEBA699FCB91959d120
  const isWethVaultByAddress = checksummedVaultAddress?.toLowerCase() === '0x21e0d366272798da3A977FEBA699FCB91959d120'.toLowerCase();

  const executeVaultAction = useCallback(async (
    action: VaultAction,
    vault: string,
    amount?: string,
    onProgress?: TransactionProgressCallback,
    destinationVault?: string, // For transfer operations
    assetDecimalsOverride?: number // Override asset decimals from selected asset
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
    
    // Additional check: ensure simulation state has data
    if (!currentSimulationState.vaults || Object.keys(currentSimulationState.vaults).length === 0) {
      throw new Error('Vault data not loaded.\n\nPlease wait for the vault information to load and try again.');
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
    } catch (refetchError) {
      // Continue with cached state - it's better than failing completely
    }
    
    // Re-validate simulation state after refetch
    if (!simulationState || !simulationState.vaults || Object.keys(simulationState.vaults).length === 0) {
      throw new Error('Vault data not loaded after refresh.\n\nPlease wait for the vault information to load and try again.');
    }

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
        // Use asset decimals override if provided
        const effectiveAssetDecimals = getAssetDecimals(assetDecimalsOverride);
        
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
          // 1. Ensure gas reserve calculations are explicit and safe
          // 2. Provide clear error messages about available balances
          // 3. Have full control over the wrapping logic
          
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
          
          // Estimate gas needed for wrapping ETH (if we need to wrap)
          // A typical WETH wrap + deposit via bundler costs around 0.00005-0.0001 ETH
          // We use a conservative but reasonable estimate
          const estimatedGasForWrap = parseUnits('0.0001', 18); // Conservative estimate for wrap + deposit + bundler
          
          // Calculate wrappable ETH: available ETH minus estimated gas
          // For very small balances, allow wrapping most of it (wallet will handle gas estimation)
          const wrappableEth = availableEth > estimatedGasForWrap 
            ? availableEth - estimatedGasForWrap 
            : (availableEth > parseUnits('0.00005', 18) 
              ? availableEth - parseUnits('0.00005', 18) // Reserve minimum for very small amounts
              : BigInt(0));
          
          // Total available: existing WETH + wrappable ETH (ETH that can actually be wrapped)
          const totalAvailable = existingWeth + wrappableEth;
          
          // Detailed balance information for error messages
          const existingWethFormatted = formatUnits(existingWeth, 18);
          const availableEthFormatted = formatUnits(availableEth, 18);
          const wrappableEthFormatted = formatUnits(wrappableEth, 18);
          const totalAvailableFormatted = formatUnits(totalAvailable, 18);
          const requestedFormatted = formatUnits(amountBigInt, 18);
          
          if (amountBigInt > totalAvailable) {
            throw new Error(
              `Insufficient balance for WETH vault deposit.\n\n` +
              `Requested: ${requestedFormatted} WETH\n` +
              `Available: ${totalAvailableFormatted} WETH\n\n` +
              `Breakdown:\n` +
              `  • Existing WETH: ${existingWethFormatted} WETH\n` +
              `  • Wrappable ETH: ${wrappableEthFormatted} ETH (${availableEthFormatted} ETH minus ~0.0001 ETH for gas)\n\n` +
              `Please reduce the amount or add more funds to your wallet.`
            );
          }
          
          // Determine how much ETH to wrap
          const ethToWrap = amountBigInt > existingWeth ? amountBigInt - existingWeth : BigInt(0);
          
          // If we need to wrap ETH, add wrap operation
          if (ethToWrap > BigInt(0)) {
            if (ethToWrap > wrappableEth) {
              const ethToWrapFormatted = formatUnits(ethToWrap, 18);
              throw new Error(
                `Cannot wrap ${ethToWrapFormatted} ETH.\n\n` +
                `Available ETH: ${availableEthFormatted} ETH\n` +
                `Wrappable ETH (after gas): ${wrappableEthFormatted} ETH\n` +
                `ETH needed to wrap: ${ethToWrapFormatted} ETH\n\n` +
                `Some ETH is reserved for transaction gas fees. Please reduce the amount slightly.`
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
      // Note: We handle WETH wrapping manually (see deposit flow above) rather than via
      // getRequirementOperations to maintain explicit gas reserve logic and better error messages.
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
        const stepLabel = prerequisiteTxCount > 1 
          ? `Pre authorize ${i + 1}/${prerequisiteTxCount}` 
          : 'Pre authorize';
        
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
      onProgress?.({ 
        type: 'confirming', 
        stepIndex: currentStepIndex, 
        totalSteps,
        stepLabel: 'Confirm',
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
    accountAddress,
    currentSimulationState,
    isSimulationPending,
    assetAddress,
    vaultDataContext,
    refetchSimulationState
  ]);

  return {
    executeVaultAction,
    isLoading: isLoading || isSimulationPending,
    error: simulationError 
  };
}