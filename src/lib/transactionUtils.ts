/**
 * Helper functions for transaction error handling
 */

// Helper function to check if an error is a user cancellation
export function isCancellationError(error: unknown): boolean {
  if (!error) return false;
  
  const errorString = error instanceof Error ? error.message : String(error);
  const errorLower = errorString.toLowerCase();

  return (
    errorLower.includes('user rejected') ||
    errorLower.includes('user cancelled') ||
    errorLower.includes('rejected') ||
    errorLower.includes('denied') ||
    errorLower.includes('action_cancelled') ||
    errorLower.includes('4001') ||
    errorLower.includes('user denied') ||
    errorLower.includes('user rejected the request') ||
    errorLower.includes('user rejected transaction')
  );
}

// Helper function to convert technical errors into user-friendly messages
export function formatTransactionError(error: unknown): string {
  if (!error) {
    return 'Transaction failed. Please try again.';
  }

  const errorString = error instanceof Error ? error.message : String(error);
  const errorLower = errorString.toLowerCase();

  if (isCancellationError(error)) {
    return 'Transaction cancelled.';
  }

  if (
    errorLower.includes('insufficient') ||
    errorLower.includes('balance too low') ||
    errorLower.includes('execution reverted: insufficient')
  ) {
    // If the error message already contains detailed information (like breakdown), preserve it
    if (errorString.includes('Breakdown:') || errorString.includes('Available:') || errorString.includes('Requested:')) {
      return errorString;
    }
    return 'Insufficient balance. Please check your available funds.';
  }

  if (
    errorLower.includes('reverted') ||
    errorLower.includes('execution reverted') ||
    errorLower.includes('revert')
  ) {
    return 'Transaction was reverted. Please try again with a different amount or check your balance.';
  }

  if (
    errorLower.includes('network') ||
    errorLower.includes('rpc') ||
    errorLower.includes('fetch') ||
    errorLower.includes('timeout') ||
    errorLower.includes('connection')
  ) {
    return 'Network error. Please check your connection and try again.';
  }

  if (
    errorLower.includes('gas') ||
    errorLower.includes('fee') ||
    errorLower.includes('out of gas')
  ) {
    return 'Transaction failed due to gas estimation. Please try again.';
  }

  if (
    errorLower.includes('simulation') ||
    errorLower.includes('bundler') ||
    errorLower.includes('not ready')
  ) {
    return 'System is preparing the transaction. Please wait a moment and try again.';
  }

  if (
    errorLower.includes('transaction failed') ||
    errorLower.includes('failed')
  ) {
    return 'Transaction failed. Please try again.';
  }

  if (errorString.length < 100 && !errorString.includes('Error: ')) {
    return errorString;
  }

  return 'Transaction failed. Please try again.';
}

