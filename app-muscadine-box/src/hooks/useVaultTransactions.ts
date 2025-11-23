import { useState, useCallback } from 'react';
import { useWalletClient, useAccount, usePublicClient } from 'wagmi';
import { 
  populateBundle, 
  finalizeBundle, 
  encodeBundle,
  type InputBundlerOperation,
  type BundlingOptions,
} from '@morpho-org/bundler-sdk-viem';
import { DEFAULT_SLIPPAGE_TOLERANCE } from '@morpho-org/blue-sdk';
import { parseUnits, type Address, maxUint256, getAddress } from 'viem';
import { useVaultData } from '../contexts/VaultDataContext';
import { useVaultSimulationState } from './useVaultSimulationState';
import { useTransactionModal } from '../contexts/TransactionModalContext';

type VaultAction = 'deposit' | 'withdraw' | 'withdrawAll';

export function useVaultTransactions(vaultAddress?: string) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { address: accountAddress } = useAccount();
  const vaultDataContext = useVaultData();
  const { modalState } = useTransactionModal();
  const [isLoading, setIsLoading] = useState(false);
  
  const checksummedVaultAddress = vaultAddress ? getAddress(vaultAddress) : undefined;
  // Enable simulation state when we have a vault address OR when modal is open
  // This ensures the state is ready before the user clicks confirm
  const shouldEnableSimulation = !!checksummedVaultAddress;
  
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

  const executeVaultAction = useCallback(async (
    action: VaultAction,
    vault: string,
    amount?: string
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

      // Debug: Log simulation state info
      console.log('🔍 DEBUG: Executing vault action', {
        action,
        vault: normalizedVault,
        userAddress,
        accountAddress,
        walletClientAddress: walletClient.account.address,
        hasSimulationState: !!simulationState,
        vaultsInState: simulationState.vaults ? Object.keys(simulationState.vaults) : [],
        usersInState: simulationState.users ? Object.keys(simulationState.users) : [],
        isSimulationPending,
      });

      // CRITICAL: For v1 vaults with bundler 3, populateBundle uses generalAdapter1 as sender
      // We need to verify the vault is accessible for the adapter address too
      const adapterAddress = '0xb98c948CFA24072e58935BC004a8A7b376AE746A' as Address;
      
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
      
      // Verify vault is accessible via tryGetVault (this is what populateBundle uses internally)
      const hasTryGetVault = typeof (simulationState as any).tryGetVault === 'function';
      if (hasTryGetVault) {
        try {
          // Try to get vault - this should work regardless of user address for v1 vaults
          const vaultData = (simulationState as any).tryGetVault(normalizedVault);
          if (!vaultData) {
            throw new Error(
              `Vault ${normalizedVault} not accessible via tryGetVault. ` +
              `Simulation state may not be fully loaded.`
            );
          }
          console.log('✅ DEBUG: Vault accessible via tryGetVault');
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          // If it's an "unknown vault" error, the simulation state isn't ready
          if (errorMsg.includes('unknown vault')) {
            throw new Error(
              `Vault ${normalizedVault} not accessible in simulation state. ` +
              `Please wait for the simulation state to finish loading vault data.`
            );
          }
          throw error;
        }
      }

      // Determine amount
      let amountBigInt: bigint;
      if (action === 'withdrawAll') {
        amountBigInt = maxUint256;
      } else if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Invalid amount');
      } else {
        amountBigInt = parseUnits(amount, assetDecimals);
      }

      // Build input operations
      const inputOperations: InputBundlerOperation[] = [];

      if (action === 'deposit') {
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
        inputOperations.push({
          type: 'MetaMorpho_Withdraw',
          address: normalizedVault,
          sender: userAddress,
          args: {
            assets: action === 'withdrawAll' ? maxUint256 : amountBigInt,
            owner: userAddress,
            receiver: userAddress,
            slippage: DEFAULT_SLIPPAGE_TOLERANCE,
          },
        });
      }

      // Configure bundling options
      const bundlingOptions: BundlingOptions = {
        publicAllocatorOptions: {
          enabled: true,
        },
      };

      // Step 1: Populate bundle
      // Cast simulationState to handle type compatibility
      console.log('🔍 DEBUG: Calling populateBundle', {
        inputOperations: inputOperations.map(op => ({
          type: op.type,
          address: (op as any).address,
          sender: (op as any).sender,
          args: op.args,
        })),
        vaultInState: simulationState.vaults?.[normalizedVault] ? 'yes' : 'no',
        userInState: simulationState.users?.[userAddress] ? 'yes' : 'no',
        adapterInState: simulationState.users?.['0xb98c948CFA24072e58935BC004a8A7b376AE746A'] ? 'yes' : 'no',
        allUsers: simulationState.users ? Object.keys(simulationState.users) : [],
        vaultKeys: simulationState.vaults ? Object.keys(simulationState.vaults) : [],
        // Check if tryGetVault works
        tryGetVaultWorks: (() => {
          try {
            if (typeof (simulationState as any).tryGetVault === 'function') {
              const vault = (simulationState as any).tryGetVault(normalizedVault);
              return vault ? 'yes' : 'no';
            }
            return 'method not available';
          } catch (e) {
            return `error: ${e instanceof Error ? e.message : String(e)}`;
          }
        })(),
      });
      
      const { operations } = populateBundle(
        inputOperations,
        simulationState as any,
        bundlingOptions
      );

      // Step 2: Finalize bundle (optimize and merge operations)
      const optimizedOperations = finalizeBundle(
        operations,
        simulationState as any,
        userAddress,
        undefined, // unwrapTokens
        undefined  // unwrapSlippage
      );

      // Step 3: Encode bundle
      const bundle = encodeBundle(
        optimizedOperations,
        simulationState as any,
        false // supportsSignature
      );

      // Sign any required signatures
      if (bundle.requirements.signatures.length > 0) {
        await Promise.all(
          bundle.requirements.signatures.map((requirement) =>
            requirement.sign(walletClient, walletClient.account)
          )
        );
      }

      // Send any prerequisite transactions and wait for them to be mined
      if (bundle.requirements.txs.length > 0) {
        console.log('🔍 DEBUG: Sending prerequisite transactions', {
          count: bundle.requirements.txs.length,
        });
        
        for (const { tx } of bundle.requirements.txs) {
          const prereqHash = await walletClient.sendTransaction({
            ...tx,
            account: walletClient.account,
          });
          console.log('✅ DEBUG: Prerequisite transaction sent', {
            hash: prereqHash,
          });
          
          // Wait for the transaction to be mined before proceeding
          if (publicClient) {
            try {
              await publicClient.waitForTransactionReceipt({
                hash: prereqHash,
              });
              console.log('✅ DEBUG: Prerequisite transaction confirmed');
            } catch (waitError) {
              console.warn('⚠️ DEBUG: Failed to wait for prerequisite transaction', {
                error: waitError instanceof Error ? waitError.message : String(waitError),
              });
              // Continue anyway - the transaction might still be processing
            }
          }
        }
      }

      // Send the main bundle transaction
      const bundleTx = bundle.tx();
      
      console.log('🔍 DEBUG: Bundle transaction', {
        to: bundleTx.to,
        hasData: !!bundleTx.data,
        dataLength: bundleTx.data?.length || 0,
        value: bundleTx.value?.toString() || '0',
        bundlerAddress: bundler,
        toMatchesBundler: bundleTx.to?.toLowerCase() === bundler?.toLowerCase(),
      });

      // For bundler 3, the transaction should be sent to the bundler contract
      // Ensure we're sending to the correct address
      if (!bundleTx.to) {
        throw new Error('Bundle transaction missing "to" address');
      }

      // Estimate gas first to catch any issues before sending
      let gasEstimate: bigint | undefined;
      if (publicClient && walletClient.account) {
        try {
          gasEstimate = await publicClient.estimateGas({
            account: walletClient.account,
            to: bundleTx.to,
            data: bundleTx.data,
            value: bundleTx.value || BigInt(0),
          });
          console.log('✅ DEBUG: Gas estimated successfully', {
            gasEstimate: gasEstimate.toString(),
          });
        } catch (gasError) {
          const errorMsg = gasError instanceof Error ? gasError.message : String(gasError);
          console.error('❌ DEBUG: Gas estimation failed', {
            error: errorMsg,
            to: bundleTx.to,
            dataLength: bundleTx.data?.length || 0,
            value: bundleTx.value?.toString() || '0',
          });
          
          // If gas estimation fails, the transaction will likely fail too
          // But let the wallet try anyway - some wallets handle this better
          console.warn('⚠️ Proceeding without gas estimate - wallet will estimate');
        }
      }

      const txHash = await walletClient.sendTransaction({
        to: bundleTx.to,
        data: bundleTx.data,
        value: bundleTx.value || BigInt(0),
        account: walletClient.account,
        gas: gasEstimate, // Include gas estimate if available
      });

      return txHash;
    } catch (error) {
      console.error('Vault transaction error:', error);
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
  ]);

  return {
    executeVaultAction,
    isLoading: isLoading || isSimulationPending,
    error: simulationError 
  };
}

