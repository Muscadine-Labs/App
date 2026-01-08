/**
 * Transaction utilities for V2 vaults using direct ABI calls and RPC
 * Since the bundler doesn't support v2 vaults yet, we use direct contract interactions
 */

import { type Address, type PublicClient, type WalletClient, parseUnits, formatUnits, getAddress } from 'viem';
import { BASE_WETH_ADDRESS } from './constants';

// ERC20 ABI for approvals and balance checks
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// ERC4626 ABI for vault operations
const ERC4626_ABI = [
  {
    name: 'asset',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'previewWithdraw',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'redeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToShares',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'previewRedeem',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// WETH ABI for wrapping/unwrapping
const WETH_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
] as const;

export type TransactionProgressStep = 
  | { type: 'signing'; stepIndex: number; totalSteps: number; stepLabel: string }
  | { type: 'approving'; stepIndex: number; totalSteps: number; stepLabel: string; contractAddress: string; txHash?: string }
  | { type: 'confirming'; stepIndex: number; totalSteps: number; stepLabel: string; txHash: string };

export type TransactionProgressCallback = (step: TransactionProgressStep) => void;

/**
 * Parse and validate amount string, converting to bigint
 * Truncates decimals if user enters more than assetDecimals
 */
function parseAmount(amount: string, decimals: number): bigint {
  const sanitizedAmount = amount.trim().replace(/\s+/g, '');
  if (!/^\d+\.?\d*$/.test(sanitizedAmount)) {
    throw new Error(`Invalid amount format: "${amount}". Expected a decimal number.`);
  }

  const parts = sanitizedAmount.split('.');
  const integerPart = parts[0] || '0';
  const decimalPart = parts[1] || '';

  // Truncate decimals if user entered more than allowed
  const truncatedDecimal = decimalPart.slice(0, decimals);
  const paddedDecimal = truncatedDecimal.padEnd(decimals, '0');
  const normalizedAmount = `${integerPart}.${paddedDecimal}`;
  return parseUnits(normalizedAmount, decimals);
}

/**
 * Check if token approval is needed and approve if necessary
 * @returns true if a reset was needed (caller should account for extra step)
 */
async function ensureApproval(
  publicClient: PublicClient,
  walletClient: WalletClient,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
  ownerAddress: Address,
  onProgress?: TransactionProgressCallback,
  stepIndex: number = 0,
  totalSteps: number = 1
): Promise<boolean> {
  // Check current allowance
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  }) as bigint;

  // If allowance is sufficient, no approval needed
  if (allowance >= amount) {
    return false;
  }

  if (!walletClient.account) {
    throw new Error('Wallet account not available');
  }

  let needsReset = false;
  // Handle USDT-style ERC20s: if allowance > 0 && allowance < amount, reset to 0 first
  if (allowance > BigInt(0) && allowance < amount) {
    needsReset = true;
    onProgress?.({
      type: 'approving',
      stepIndex,
      totalSteps,
      stepLabel: 'Reset approval',
      contractAddress: tokenAddress,
    });

    const resetHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spenderAddress, BigInt(0)],
      account: walletClient.account,
      chain: undefined,
    });

    onProgress?.({
      type: 'approving',
      stepIndex,
      totalSteps,
      stepLabel: 'Reset approval',
      contractAddress: tokenAddress,
      txHash: resetHash,
    });

    // Wait for reset transaction to be confirmed
    await publicClient.waitForTransactionReceipt({ hash: resetHash });
    stepIndex++; // Increment for the actual approval step
  }

  // Approve only the exact amount needed (more secure than unlimited approval)
  onProgress?.({
    type: 'approving',
    stepIndex,
    totalSteps,
    stepLabel: 'Approve token',
    contractAddress: tokenAddress,
  });

  const approveHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, amount],
    account: walletClient.account,
    chain: undefined,
  });

  onProgress?.({
    type: 'approving',
    stepIndex,
    totalSteps,
    stepLabel: 'Approve token',
    contractAddress: tokenAddress,
    txHash: approveHash,
  });

  // Wait for approval transaction to be confirmed
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  return needsReset;
}

/**
 * Wrap ETH to WETH if needed
 */
async function wrapEthIfNeeded(
  publicClient: PublicClient,
  walletClient: WalletClient,
  amount: bigint,
  onProgress?: TransactionProgressCallback,
  stepIndex: number = 0,
  totalSteps: number = 1
): Promise<void> {
  if (!walletClient.account) {
    throw new Error('Wallet account not available');
  }

  // Check ETH balance
  const ethBalance = await publicClient.getBalance({
    address: walletClient.account.address,
  });

  if (ethBalance < amount) {
    throw new Error(
      `Insufficient ETH balance.\n\n` +
      `Requested: ${formatUnits(amount, 18)} ETH\n` +
      `Available: ${formatUnits(ethBalance, 18)} ETH\n\n` +
      `Please reduce the amount or add more ETH to your wallet.`
    );
  }

  onProgress?.({
    type: 'confirming',
    stepIndex,
    totalSteps,
    stepLabel: 'Wrap ETH',
    txHash: '',
  });

  const wrapHash = await walletClient.writeContract({
    address: BASE_WETH_ADDRESS,
    abi: WETH_ABI,
    functionName: 'deposit',
    value: amount,
    account: walletClient.account,
    chain: undefined,
  });

  onProgress?.({
    type: 'confirming',
    stepIndex,
    totalSteps,
    stepLabel: 'Wrap ETH',
    txHash: wrapHash,
  });

  await publicClient.waitForTransactionReceipt({ hash: wrapHash });
}

/**
 * Unwrap WETH to ETH
 */
async function unwrapWeth(
  publicClient: PublicClient,
  walletClient: WalletClient,
  amount: bigint,
  onProgress?: TransactionProgressCallback,
  stepIndex: number = 0,
  totalSteps: number = 1
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('Wallet account not available');
  }

  // Check WETH balance
  const wethBalance = await publicClient.readContract({
    address: BASE_WETH_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletClient.account.address],
  }) as bigint;

  const unwrapAmount = amount > wethBalance ? wethBalance : amount;

  if (unwrapAmount === BigInt(0)) {
    throw new Error('No WETH to unwrap');
  }

  onProgress?.({
    type: 'confirming',
    stepIndex,
    totalSteps,
    stepLabel: 'Unwrap WETH',
    txHash: '',
  });

  const unwrapHash = await walletClient.writeContract({
    address: BASE_WETH_ADDRESS,
    abi: WETH_ABI,
    functionName: 'withdraw',
    args: [unwrapAmount],
    account: walletClient.account,
    chain: undefined,
  });

  onProgress?.({
    type: 'confirming',
    stepIndex,
    totalSteps,
    stepLabel: 'Unwrap WETH',
    txHash: unwrapHash,
  });

  await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
  return unwrapHash;
}

/**
 * Approve token spending for vault operations
 * @param amount - The exact amount to approve (in token units with decimals)
 */
export async function approveToken(
  publicClient: PublicClient,
  walletClient: WalletClient,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
  onProgress?: TransactionProgressCallback
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('Wallet not connected');
  }

  const ownerAddress = walletClient.account.address;

  // Check current allowance
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  }) as bigint;

  // If already approved for this amount or more, return early
  if (allowance >= amount) {
    return '';
  }

  // Determine if reset is needed (USDT-style ERC20s: allowance > 0 && allowance < amount)
  const needsReset = allowance > BigInt(0) && allowance < amount;
  const totalSteps = needsReset ? 2 : 1;

  // Handle USDT-style ERC20s: if allowance > 0 && allowance < amount, reset to 0 first
  if (needsReset) {
    onProgress?.({
      type: 'approving',
      stepIndex: 0,
      totalSteps,
      stepLabel: 'Reset approval',
      contractAddress: tokenAddress,
    });

    const resetHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spenderAddress, BigInt(0)],
      account: walletClient.account,
      chain: undefined,
    });

    onProgress?.({
      type: 'approving',
      stepIndex: 0,
      totalSteps,
      stepLabel: 'Reset approval',
      contractAddress: tokenAddress,
      txHash: resetHash,
    });

    await publicClient.waitForTransactionReceipt({ hash: resetHash });
  }

  const stepIndex = needsReset ? 1 : 0;

  onProgress?.({
    type: 'approving',
    stepIndex,
    totalSteps,
    stepLabel: 'Approve token',
    contractAddress: tokenAddress,
  });

  // Approve only the exact amount needed (more secure than unlimited approval)
  const approveHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, amount],
    account: walletClient.account,
    chain: undefined,
  });

  onProgress?.({
    type: 'approving',
    stepIndex,
    totalSteps,
    stepLabel: 'Approve token',
    contractAddress: tokenAddress,
    txHash: approveHash,
  });

  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  return approveHash;
}

/**
 * Deposit assets into a v2 vault
 */
export async function depositToVaultV2(
  publicClient: PublicClient,
  walletClient: WalletClient,
  vaultAddress: Address,
  amount: string,
  assetDecimals: number,
  preferredAsset?: 'ETH' | 'WETH' | 'ALL',
  onProgress?: TransactionProgressCallback
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('Wallet not connected');
  }

  const userAddress = walletClient.account.address;
  const normalizedVault = getAddress(vaultAddress);

  // Get vault asset address
  const assetAddress = await publicClient.readContract({
    address: normalizedVault,
    abi: ERC4626_ABI,
    functionName: 'asset',
  }) as Address;

  const isWethVault = assetAddress.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase();

  // Parse amount using centralized function
  const amountBigInt = parseAmount(amount, assetDecimals);

  // Calculate total steps
  let totalSteps = 1;
  let currentStep = 0;

  // For WETH vaults, handle wrapping
  if (isWethVault) {
    // Fetch balances
    const existingWeth = await publicClient.readContract({
      address: BASE_WETH_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    }) as bigint;

    const availableEth = await publicClient.getBalance({
      address: userAddress,
    });

    const assetPreference = preferredAsset || 'ALL';
    let ethToWrap: bigint = BigInt(0);

    if (assetPreference === 'ETH') {
      if (amountBigInt > availableEth) {
        throw new Error(
          `Insufficient ETH balance.\n\n` +
          `Requested: ${formatUnits(amountBigInt, 18)} ETH\n` +
          `Available: ${formatUnits(availableEth, 18)} ETH\n\n` +
          `Please reduce the amount or add more ETH to your wallet.`
        );
      }
      ethToWrap = amountBigInt;
      totalSteps = 3; // Wrap, Approve, Deposit
    } else if (assetPreference === 'WETH') {
      if (amountBigInt > existingWeth) {
        throw new Error(
          `Insufficient WETH balance.\n\n` +
          `Requested: ${formatUnits(amountBigInt, 18)} WETH\n` +
          `Available: ${formatUnits(existingWeth, 18)} WETH\n\n` +
          `Please reduce the amount or add more WETH to your wallet.`
        );
      }
      ethToWrap = BigInt(0);
      totalSteps = 2; // Approve, Deposit
    } else {
      // ALL: Use both ETH + WETH
      const totalAvailable = existingWeth + availableEth;
      if (amountBigInt > totalAvailable) {
        throw new Error(
          `Insufficient balance for WETH vault deposit.\n\n` +
          `Requested: ${formatUnits(amountBigInt, 18)} WETH\n` +
          `Available: ${formatUnits(totalAvailable, 18)} WETH\n\n` +
          `Breakdown:\n` +
          `  • Existing WETH: ${formatUnits(existingWeth, 18)} WETH\n` +
          `  • Wrappable ETH: ${formatUnits(availableEth, 18)} ETH\n\n` +
          `Please reduce the amount or add more funds to your wallet.`
        );
      }
      ethToWrap = amountBigInt > existingWeth ? amountBigInt - existingWeth : BigInt(0);
      totalSteps = ethToWrap > BigInt(0) ? 3 : 2; // Wrap (if needed), Approve, Deposit
    }

    // Wrap ETH if needed
    if (ethToWrap > BigInt(0)) {
      await wrapEthIfNeeded(publicClient, walletClient, ethToWrap, onProgress, currentStep, totalSteps);
      currentStep++;
    }
  } else {
    totalSteps = 2; // Approve, Deposit
  }

  // Check if approval needs reset (to account for extra step)
  const allowance = await publicClient.readContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [userAddress, normalizedVault],
  }) as bigint;
  
  const needsReset = allowance > BigInt(0) && allowance < amountBigInt;
  if (needsReset) {
    totalSteps++; // Account for reset step
  }

  // Ensure token approval
  await ensureApproval(
    publicClient,
    walletClient,
    assetAddress,
    normalizedVault,
    amountBigInt,
    userAddress,
    onProgress,
    currentStep,
    totalSteps
  );
  currentStep += needsReset ? 2 : 1; // Increment by 2 if reset was needed, 1 otherwise

  // Deposit to vault
  onProgress?.({
    type: 'confirming',
    stepIndex: currentStep,
    totalSteps,
    stepLabel: 'Deposit',
    txHash: '',
  });

  const depositHash = await walletClient.writeContract({
    address: normalizedVault,
    abi: ERC4626_ABI,
    functionName: 'deposit',
    args: [amountBigInt, userAddress], // assets, onBehalf
    account: walletClient.account,
    chain: undefined,
  });

  onProgress?.({
    type: 'confirming',
    stepIndex: currentStep,
    totalSteps,
    stepLabel: 'Deposit',
    txHash: depositHash,
  });

  await publicClient.waitForTransactionReceipt({ hash: depositHash });
  return depositHash;
}

/**
 * Withdraw assets from a v2 vault
 */
export async function withdrawFromVaultV2(
  publicClient: PublicClient,
  walletClient: WalletClient,
  vaultAddress: Address,
  amount: string,
  assetDecimals: number,
  preferredAsset?: 'ETH' | 'WETH',
  onProgress?: TransactionProgressCallback
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('Wallet not connected');
  }

  const userAddress = walletClient.account.address;
  const normalizedVault = getAddress(vaultAddress);

  // Get vault asset address
  const assetAddress = await publicClient.readContract({
    address: normalizedVault,
    abi: ERC4626_ABI,
    functionName: 'asset',
  }) as Address;

  const isWethVault = assetAddress.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase();

  // Parse amount using centralized function
  const amountBigInt = parseAmount(amount, assetDecimals);

  // Get user's share balance
  const userShares = await publicClient.readContract({
    address: normalizedVault,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [userAddress],
  }) as bigint;

  if (userShares === BigInt(0)) {
    throw new Error('No shares to withdraw');
  }

  // Use previewWithdraw for accurate share calculation (avoids rounding issues)
  const sharesNeeded = await publicClient.readContract({
    address: normalizedVault,
    abi: ERC4626_ABI,
    functionName: 'previewWithdraw',
    args: [amountBigInt],
  }) as bigint;

  // Validate user has enough shares
  if (sharesNeeded > userShares) {
    const availableAssets = await publicClient.readContract({
      address: normalizedVault,
      abi: ERC4626_ABI,
      functionName: 'convertToAssets',
      args: [userShares],
    }) as bigint;

    throw new Error(
      `Insufficient balance for vault withdrawal.\n\n` +
      `Requested: ${formatUnits(amountBigInt, assetDecimals)} assets\n` +
      `Available: ${formatUnits(availableAssets, assetDecimals)} assets\n\n` +
      `Please reduce the amount or deposit more funds to the vault.`
    );
  }

  const totalSteps = isWethVault && preferredAsset === 'ETH' ? 2 : 1; // Withdraw + Unwrap (if needed)
  let currentStep = 0;

  // Withdraw from vault
  onProgress?.({
    type: 'confirming',
    stepIndex: currentStep,
    totalSteps,
    stepLabel: 'Withdraw',
    txHash: '',
  });

  const withdrawHash = await walletClient.writeContract({
    address: normalizedVault,
    abi: ERC4626_ABI,
    functionName: 'withdraw',
    args: [amountBigInt, userAddress, userAddress],
    account: walletClient.account,
    chain: undefined,
  });

  onProgress?.({
    type: 'confirming',
    stepIndex: currentStep,
    totalSteps,
    stepLabel: 'Withdraw',
    txHash: withdrawHash,
  });

  await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
  currentStep++;

  // Unwrap WETH to ETH if requested
  // unwrapWeth already reads current balance and caps to available, no setTimeout needed
  if (isWethVault && preferredAsset === 'ETH') {
    await unwrapWeth(
      publicClient,
      walletClient,
      amountBigInt,
      onProgress,
      currentStep,
      totalSteps
    );
  }

  return withdrawHash;
}

/**
 * Redeem (withdraw all) shares from a v2 vault
 */
export async function redeemFromVaultV2(
  publicClient: PublicClient,
  walletClient: WalletClient,
  vaultAddress: Address,
  assetDecimals: number,
  preferredAsset?: 'ETH' | 'WETH',
  onProgress?: TransactionProgressCallback
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('Wallet not connected');
  }

  const userAddress = walletClient.account.address;
  const normalizedVault = getAddress(vaultAddress);

  // Get vault asset address
  const assetAddress = await publicClient.readContract({
    address: normalizedVault,
    abi: ERC4626_ABI,
    functionName: 'asset',
  }) as Address;

  const isWethVault = assetAddress.toLowerCase() === BASE_WETH_ADDRESS.toLowerCase();

  // Get user's share balance
  const userShares = await publicClient.readContract({
    address: normalizedVault,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [userAddress],
  }) as bigint;

  if (userShares === BigInt(0)) {
    throw new Error('No shares to redeem');
  }

  // Get asset amount from shares using previewRedeem for more accurate calculation
  // Falls back to convertToAssets if previewRedeem is not available
  let assetAmount: bigint;
  try {
    assetAmount = await publicClient.readContract({
      address: normalizedVault,
      abi: ERC4626_ABI,
      functionName: 'previewRedeem',
      args: [userShares],
    }) as bigint;
  } catch {
    // Fallback to convertToAssets if previewRedeem is not implemented
    assetAmount = await publicClient.readContract({
      address: normalizedVault,
      abi: ERC4626_ABI,
      functionName: 'convertToAssets',
      args: [userShares],
    }) as bigint;
  }

  const totalSteps = isWethVault && preferredAsset === 'ETH' ? 2 : 1; // Redeem + Unwrap (if needed)
  let currentStep = 0;

  // Redeem shares
  onProgress?.({
    type: 'confirming',
    stepIndex: currentStep,
    totalSteps,
    stepLabel: 'Redeem',
    txHash: '',
  });

  const redeemHash = await walletClient.writeContract({
    address: normalizedVault,
    abi: ERC4626_ABI,
    functionName: 'redeem',
    args: [userShares, userAddress, userAddress],
    account: walletClient.account,
    chain: undefined,
  });

  onProgress?.({
    type: 'confirming',
    stepIndex: currentStep,
    totalSteps,
    stepLabel: 'Redeem',
    txHash: redeemHash,
  });

  await publicClient.waitForTransactionReceipt({ hash: redeemHash });
  currentStep++;

  // Unwrap WETH to ETH if requested
  // unwrapWeth already reads current balance and caps to available, no setTimeout needed
  if (isWethVault && preferredAsset === 'ETH') {
    await unwrapWeth(
      publicClient,
      walletClient,
      assetAmount,
      onProgress,
      currentStep,
      totalSteps
    );
  }

  return redeemHash;
}
