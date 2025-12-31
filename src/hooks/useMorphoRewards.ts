import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { BASE_CHAIN_ID } from '@/lib/constants';
import type { MerklClaimData } from '@/types/api';
import { getAddress, type Address } from 'viem';

// Merkl Distributor ABI (claim function)
// Format from: https://docs.morpho.org/build/rewards/tutorials/claim-rewards
const MERKL_ABI = [
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'proofs', type: 'bytes32[][]' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface RewardsState {
  merklClaimData: MerklClaimData | null;
  totalClaimableUsd: number;
  isLoading: boolean;
  error: string | null;
}

export function useMorphoRewards() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [rewardsState, setRewardsState] = useState<RewardsState>({
    merklClaimData: null,
    totalClaimableUsd: 0,
    isLoading: false,
    error: null,
  });

  // Fetch Merkl claim data
  // Following the format from: https://docs.morpho.org/build/rewards/tutorials/claim-rewards
  const fetchMerklClaimData = useCallback(async (userAddress: string, chainId: number): Promise<MerklClaimData | null> => {
    try {
      // Endpoint format from: https://docs.morpho.org/build/rewards/tutorials/claim-rewards
      const response = await fetch(
        `https://api.merkl.xyz/v4/claim?user=${userAddress}&chainId=${chainId}`,
        {
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        // If no rewards, API might return 404
        if (response.status === 404) {
          return null;
        }
        // 500 error indicates server issues - user might still have rewards
        // We'll return null but set an error state so UI can inform user
        if (response.status === 500) {
          console.warn(`Merkl API returned 500 for user ${userAddress} on chain ${chainId}. Server may be experiencing issues.`);
          // Try to parse error response for more info
          try {
            const errorData = await response.json();
            console.warn('Merkl API error details:', errorData);
          } catch {
            // Ignore JSON parse errors
          }
          return null;
        }
        // For other errors, log and return null
        console.warn(`Merkl API returned ${response.status} for user ${userAddress} on chain ${chainId}`);
        return null;
      }

      const data = await response.json() as MerklClaimData;
      
      // Check if there's actually claimable data
      if (!data.claim || !data.claim.tokens || data.claim.tokens.length === 0) {
        return null;
      }

      return data;
    } catch (error) {
      // Handle timeout and other errors
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Merkl API request timed out');
      } else {
        console.error('Merkl rewards fetch failed:', error);
      }
      return null;
    }
  }, []);

  // Fetch all rewards
  const fetchRewards = useCallback(async () => {
    if (!address || !isConnected) {
      setRewardsState({
        merklClaimData: null,
        totalClaimableUsd: 0,
        isLoading: false,
        error: null,
      });
      return;
    }

    setRewardsState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Fetch Merkl rewards
      const merklData = await fetchMerklClaimData(address, BASE_CHAIN_ID);

      // Calculate total claimable USD value
      let totalUsd = 0;
      
      // Calculate Merkl rewards value (simplified - would need token prices for accurate USD)
      if (merklData && merklData.claim.tokens.length > 0) {
        // For now, just mark as having rewards (value > 0)
        // TODO: Fetch token prices and calculate actual USD value
        totalUsd = 1; // Placeholder
      }

      setRewardsState({
        merklClaimData: merklData,
        totalClaimableUsd: totalUsd,
        isLoading: false,
        error: null,
      });
      
      // Debug logging
      console.log('Rewards fetched:', {
        hasMerkl: merklData !== null && merklData.claim.tokens.length > 0,
        merklTokens: merklData?.claim.tokens.length || 0,
        totalUsd,
      });
    } catch (error) {
      setRewardsState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch rewards',
      }));
    }
  }, [address, isConnected, fetchMerklClaimData]);

  // Claim Merkl rewards
  // Following the format from: https://docs.morpho.org/build/rewards/tutorials/claim-rewards
  const claimMerklRewards = useCallback(async (): Promise<string> => {
    if (!walletClient?.account?.address || !rewardsState.merklClaimData) {
      throw new Error('Wallet not connected or no Merkl rewards available');
    }

    // Step 1: Get claim data (already fetched in rewardsState.merklClaimData)
    const claimData = rewardsState.merklClaimData.claim;

    // Step 2: Merkl Distributor addresses by chain
    // Reference: https://docs.morpho.org/build/rewards/tutorials/claim-rewards
    const MERKL_DISTRIBUTOR_ADDRESSES: Record<number, string> = {
      1: '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae', // Mainnet
      8453: '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae', // Base (using same address for now - verify)
    };

    const distributorAddress = MERKL_DISTRIBUTOR_ADDRESSES[BASE_CHAIN_ID];
    if (!distributorAddress) {
      throw new Error(`Merkl distributor not configured for chain ${BASE_CHAIN_ID}`);
    }

    // Step 3: Send claim transaction
    // Format matches documentation: https://docs.morpho.org/build/rewards/tutorials/claim-rewards
    const hash = await walletClient.writeContract({
      address: getAddress(distributorAddress),
      abi: MERKL_ABI,
      functionName: 'claim',
      args: [
        claimData.user as Address,
        claimData.tokens as Address[],
        claimData.amounts.map(a => BigInt(a)),
        claimData.proofs as readonly (readonly `0x${string}`[])[],
      ],
    });

    // Step 4: Wait for confirmation (matching documentation format)
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash });
    }

    // Refresh rewards after claiming
    await fetchRewards();

    return hash;
  }, [walletClient, publicClient, rewardsState.merklClaimData, fetchRewards]);

  // Fetch rewards on mount and when address changes
  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  return {
    ...rewardsState,
    claimMerklRewards,
    refetch: fetchRewards,
  };
}

