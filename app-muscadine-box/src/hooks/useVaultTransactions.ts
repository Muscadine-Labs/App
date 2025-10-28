import { useState } from 'react';
import { useWriteContract, usePublicClient } from 'wagmi';
import { useAccount } from 'wagmi';
import { parseUnits, formatUnits } from "viem";

export function useVaultTransactions() {
  const [isLoading, setIsLoading] = useState(false);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { address } = useAccount();

  // Helper to detect user cancellations (more precise detection)
  const isUserCancellation = (error: any): boolean => {
    if (!error) return false;
    
    console.log('Checking error for user cancellation:', {
      error,
      message: error?.message,
      name: error?.name,
      code: error?.code,
      reason: error?.reason,
      toString: error?.toString()
    });
    
    const errorMessage = (error?.message || error?.toString() || '').toLowerCase();
    const errorCode = error?.code?.toString() || '';
    const errorReason = (error?.reason || '').toLowerCase();
    
    // Primary indicators of user cancellation (more specific)
    const isExplicitRejection = errorMessage.includes('user rejected') ||
           errorMessage.includes('user denied') ||
           errorMessage.includes('rejected by user') ||
           errorMessage.includes('user cancelled') ||
           errorMessage.includes('cancelled by user') ||
           errorMessage.includes('user rejected the request') ||
           errorMessage.includes('request rejected') ||
           errorMessage.includes('transaction rejected') ||
           errorMessage.includes('action rejected') ||
           errorMessage.includes('user declined') ||
           errorMessage.includes('declined by user') ||
           errorMessage.includes('user aborted') ||
           errorMessage.includes('aborted by user');
    
    // Specific error codes that indicate user rejection
    const isRejectionCode = errorCode === '4001' || // User rejected the request
                           errorCode === 'ACTION_REJECTED' ||
                           errorCode === 'USER_REJECTED' ||
                           errorCode === '4900'; // Unauthorized (user rejected)
    
    // Check error reason as well
    const isRejectionReason = errorReason.includes('user rejected') ||
                             errorReason.includes('user denied') ||
                             errorReason.includes('rejected') ||
                             errorReason.includes('cancelled') ||
                             errorReason.includes('denied') ||
                             errorReason.includes('aborted');
    
    const isCancellation = isExplicitRejection || isRejectionCode || isRejectionReason;
    
    console.log('Cancellation check result:', { 
      isExplicitRejection, 
      isRejectionCode, 
      isRejectionReason,
      isCancellation,
      errorMessage, 
      errorCode, 
      errorReason 
    });
    
    return isCancellation;
  };

  // Helper to get asset info
  const getAssetInfo = async (vaultAddress: string) => {
    if (!publicClient) throw new Error('Network not available');
    
    const assetAddress = await publicClient.readContract({
      address: vaultAddress as `0x${string}`,
      abi: [{ "inputs": [], "name": "asset", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function" }],
      functionName: "asset",
    });

    const decimals = await publicClient.readContract({
      address: assetAddress as `0x${string}`,
      abi: [{ "inputs": [], "name": "decimals", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "stateMutability": "view", "type": "function" }],
      functionName: "decimals",
    });

    return { assetAddress, decimals: Number(decimals) };
  };

  // Approve tokens (step 1)
  const approveTokens = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToApprove = BigInt(parseUnits(amount, decimals));
      
      const txHash = await writeContractAsync({
        address: assetAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "address", "name": "spender", "type": "address"},
              {"internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "approve",
        args: [vaultAddress as `0x${string}`, amountToApprove],
      });

      console.log('Approval transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Approval was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Check if approval is needed
  const checkApprovalNeeded = async (vaultAddress: string, amount: string) => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    
    const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
    const amountToCheck = BigInt(parseUnits(amount, decimals));
    
    const allowance = await publicClient.readContract({
      address: assetAddress as `0x${string}`,
      abi: [
        {
          "inputs": [
            {"internalType": "address", "name": "owner", "type": "address"},
            {"internalType": "address", "name": "spender", "type": "address"}
          ],
          "name": "allowance",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }
      ],
      functionName: "allowance",
      args: [address as `0x${string}`, vaultAddress as `0x${string}`],
    });

    return {
      needsApproval: allowance < amountToCheck,
      currentAllowance: formatUnits(allowance, decimals),
      requiredAmount: amount
    };
  };

  // Execute deposit (step 2)
  const executeDeposit = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToDeposit = BigInt(parseUnits(amount, decimals));
      
      // Check balance
      const userBalance = await publicClient!.readContract({
        address: assetAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userBalance < amountToDeposit) {
        throw new Error(`Insufficient balance. You have ${formatUnits(userBalance, decimals)} tokens.`);
      }

      // Execute deposit
      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "assets", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"}
            ],
            "name": "deposit",
            "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "deposit",
        args: [amountToDeposit, address as `0x${string}`],
      });

      console.log('Deposit transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Deposit was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Deposit function
  const deposit = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      const { assetAddress, decimals } = await getAssetInfo(vaultAddress);
      const amountToDeposit = BigInt(parseUnits(amount, decimals));
      
      // Check balance
      const userBalance = await publicClient!.readContract({
        address: assetAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userBalance < amountToDeposit) {
        throw new Error(`Insufficient balance. You have ${formatUnits(userBalance, decimals)} tokens.`);
      }

      // Note: Approval should be handled separately using approveTokens function
      
      // Execute deposit
      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "assets", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"}
            ],
            "name": "deposit",
            "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "deposit",
        args: [amountToDeposit, address as `0x${string}`],
      });

      console.log('Deposit transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Transaction was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Withdraw all function
  const withdrawAll = async (vaultAddress: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');

      const userShares = await publicClient!.readContract({
        address: vaultAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userShares === BigInt(0)) {
        throw new Error("No vault shares to withdraw");
      }

      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "shares", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"},
              {"internalType": "address", "name": "owner", "type": "address"}
            ],
            "name": "redeem",
            "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "redeem",
        args: [userShares, address as `0x${string}`, address as `0x${string}`],
      });

      console.log('WithdrawAll transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Transaction was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Withdraw specific amount function
  const withdrawAssets = async (vaultAddress: string, amount: string) => {
    try {
      setIsLoading(true);
      
      if (!address) throw new Error('Wallet not connected');
      
      const { decimals } = await getAssetInfo(vaultAddress);
      const amountToWithdraw = BigInt(parseUnits(amount, decimals));
      
      const userShares = await publicClient!.readContract({
        address: vaultAddress as `0x${string}`,
        abi: [{ "inputs": [{"internalType": "address", "name": "account", "type": "address"}], "name": "balanceOf", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function" }],
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      if (userShares === BigInt(0)) {
        throw new Error("No vault shares to withdraw");
      }

      const txHash = await writeContractAsync({
        address: vaultAddress as `0x${string}`,
        abi: [
          {
            "inputs": [
              {"internalType": "uint256", "name": "assets", "type": "uint256"},
              {"internalType": "address", "name": "receiver", "type": "address"},
              {"internalType": "address", "name": "owner", "type": "address"}
            ],
            "name": "withdraw",
            "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: "withdraw",
        args: [amountToWithdraw, address as `0x${string}`, address as `0x${string}`],
      });

      console.log('WithdrawAssets transaction hash:', txHash);
      return txHash;
    } catch (error) {
      if (isUserCancellation(error)) {
        throw new Error('Transaction was cancelled by user');
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    deposit,
    withdrawAll,
    withdrawAssets,
    approveTokens,
    executeDeposit,
    checkApprovalNeeded,
    isLoading,
  };
}
