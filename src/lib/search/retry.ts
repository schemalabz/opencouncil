import { errors } from '@elastic/elasticsearch';
import { retryWithBackoff, RetryConfig } from '@/lib/utils/retry';

/**
 * Determines if an Elasticsearch error is retryable
 * Focuses on cold start and temporary unavailability scenarios
 */
function isRetryableElasticsearchError(error: unknown): boolean {
  // Handle ResponseError - check status codes
  if (error instanceof errors.ResponseError) {
    const statusCode = error.statusCode;
    
    // Retry on these HTTP status codes
    // 408: Request Timeout
    // 429: Too Many Requests (rate limiting during spin-up)
    // 503: Service Unavailable (primary cold start indicator)
    // 504: Gateway Timeout
    if ([408, 429, 503, 504].includes(statusCode || 0)) {
      return true;
    }

    // Check for specific error messages related to model/inference loading
    const errorBody = error.body as any;
    const errorReason = errorBody?.error?.reason || '';
    const errorType = errorBody?.error?.type || '';
    const errorMessage = error.message || '';
    
    // Check in both the error reason and type for inference-related issues
    const searchText = `${errorReason} ${errorType} ${errorMessage}`.toLowerCase();
    
    if (
      searchText.includes('model is being loaded') ||
      searchText.includes('model_loading') ||
      searchText.includes('deployment not found') ||
      searchText.includes('inference') ||
      searchText.includes('not ready') ||
      searchText.includes('starting') ||
      searchText.includes('allocat')
    ) {
      return true;
    }
  }

  // Handle connection errors - these can occur during cold starts
  if (error instanceof errors.ConnectionError) {
    return true;
  }

  // Handle timeout errors - common during resource spin-up
  if (error instanceof errors.TimeoutError) {
    return true;
  }

  // Handle no living connections - can happen during initialization
  if (error instanceof errors.NoLivingConnectionsError) {
    return true;
  }

  // Handle request aborted - might happen during unstable startup
  if (error instanceof errors.RequestAbortedError) {
    return true;
  }

  // Handle generic network errors that might indicate cold start
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Retry configuration optimized for Elasticsearch cold starts
 * - Starts with 2 second delay (sufficient for most cold starts)
 * - Doubles delay each retry (2s, 4s, 8s)
 * - Max 3 attempts to balance availability and latency
 */
export const ELASTICSEARCH_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 2000, // Start with 2 seconds for cold start
  maxDelayMs: 10000,    // Max 10 seconds
  backoffMultiplier: 2,
  shouldRetry: isRetryableElasticsearchError,
};

/**
 * Executes an Elasticsearch operation with automatic retry logic
 * for cold start and transient errors
 * 
 * @param fn - The Elasticsearch operation to execute
 * @param context - Context string for logging (e.g., "Search", "Index")
 * @returns Promise resolving to the operation result
 * @throws The last error if all retry attempts fail or error is not retryable
 */
export async function executeElasticsearchWithRetry<T>(
  fn: () => Promise<T>,
  context: string = 'Elasticsearch operation'
): Promise<T> {
  return retryWithBackoff(fn, {
    ...ELASTICSEARCH_RETRY_CONFIG,
    onRetry: (error, attempt, delayMs) => {
      const errorDetails = error instanceof errors.ResponseError
        ? `Status ${error.statusCode}: ${error.message}`
        : error instanceof Error
        ? error.message
        : 'Unknown error';
      
      console.log(
        `[${context}] Retry attempt ${attempt} after ${delayMs}ms delay. ` +
        `Error: ${errorDetails}`
      );
    },
  });
}

