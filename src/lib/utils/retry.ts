export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Retries a function with exponential backoff
 * 
 * @param fn - The async function to retry
 * @param config - Configuration for retry behavior
 * @returns Promise resolving to the function's return value
 * @throws The last error if all retry attempts fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      const shouldRetry = finalConfig.shouldRetry?.(error, attempt) ?? true;
      
      // Don't retry if this is the last attempt or error is not retryable
      if (attempt >= finalConfig.maxAttempts || !shouldRetry) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
        finalConfig.maxDelayMs
      );

      // Call retry callback if provided
      finalConfig.onRetry?.(error, attempt, delayMs);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

