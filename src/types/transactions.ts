/**
 * Shared transaction types for consistent progress tracking across v1 and v2 flows
 */

export type TransactionProgressStep = 
  | { type: 'signing'; stepIndex: number; totalSteps: number; stepLabel: string }
  | { type: 'approving'; stepIndex: number; totalSteps: number; stepLabel: string; contractAddress: string; txHash?: string }
  | { type: 'confirming'; stepIndex: number; totalSteps: number; stepLabel: string; txHash: string };

export type TransactionProgressCallback = (step: TransactionProgressStep) => void;
