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

// ABI for vault asset() function
const VAULT_ASSET_ABI = [
  {
    inputs: [],
    name: "asset",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
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
    query: { enabled: !!accountAddress && !!assetAddress && assetAddress?.toLowerCase() === '0x4200000000000000000000000000000000000006'.toLowerCase() },
  });

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

      // Constants for Base Chain
      const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

      // Check if this is a WETH vault (Using case-insensitive comparison)
      const isWethVault = assetAddress?.toLowerCase() === WETH_ADDRESS.toLowerCase();

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
        amountBigInt = parseUnits(amount, assetDecimals);
      }

      // Build input operations
      const inputOperations: InputBundlerOperation[] = [];

      if (action === 'deposit') {
        if (isWethVault) {
          // --- SPECIAL FLOW FOR WETH VAULTS ---
          // Can deposit both existing WETH and wrap ETH as needed
          const existingWeth = (wethBalance as bigint) || BigInt(0);
          const availableEth = ethBalance?.value || BigInt(0);
          
          // Reserve ETH for gas fees (estimate ~0.0001 ETH = 100000000000000 wei)
          const GAS_RESERVE = parseUnits('0.0001', 18);
          
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
          
          // Determine how much to use from existing WETH vs wrapping ETH
          const wethToUse = amountBigInt > existingWeth ? existingWeth : amountBigInt;
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
              address: WETH_ADDRESS,
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
          inputOperations.push({
            type: 'MetaMorpho_Withdraw',
            address: normalizedVault,
            sender: userAddress,
            args: {
              assets: amountBigInt,
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
      const { bundle } = setupBundle(
        inputOperations,
        simulationState as any,
        userAddress, // receiver
        {
          ...bundlingOptions,
          supportsSignature: false,
        }
      );

      // Sign any required signatures
      if (bundle.requirements.signatures.length > 0) {
        await Promise.all(
          bundle.requirements.signatures.map((requirement) =>
            requirement.sign(walletClient, walletClient.account)
          )
        );
      }

      // Track if we sent prerequisite transactions (like approvals)
      const hadPrerequisiteTxs = bundle.requirements.txs.length > 0;
      
      // Send any prerequisite transactions and wait for them to be mined
      if (hadPrerequisiteTxs) {
        for (const { tx } of bundle.requirements.txs) {
          const prereqHash = await walletClient.sendTransaction({
            ...tx,
            account: walletClient.account,
          });
          
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash: prereqHash });
          }
        }
        
        // After prerequisite transactions (like approvals), wait a moment for state to propagate
        // This ensures the simulation state reflects the new allowances before we estimate gas
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
          
          if (hadPrerequisiteTxs && isAllowanceError) {
            // Wait a bit longer for state to propagate, then recreate bundle
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Recreate the bundle with updated simulation state
            const { bundle: refreshedBundle } = setupBundle(
              inputOperations,
              simulationState as any,
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

      const txHash = await walletClient.sendTransaction({
        to: bundleTx.to,
        data: bundleTx.data,
        value: bundleTx.value || BigInt(0),
        account: walletClient.account,
        gas: gasEstimate,
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
    assetAddress,
    ethBalance
  ]);

  return {
    executeVaultAction,
    isLoading: isLoading || isSimulationPending,
    error: simulationError 
  };
}