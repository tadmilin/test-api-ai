/**
 * Retry helper with Exponential Backoff and Jitter
 * 
 * Handles MongoDB WriteConflict errors (code 112) and other transient failures
 * with proper exponential backoff strategy.
 * 
 * @param operation - Async function to retry
 * @param options - Configuration options
 * @returns Result of the operation
 * @throws Error if all retries are exhausted or non-retryable error occurs
 */

interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number
  /** Base delay in milliseconds for exponential calculation (default: 100) */
  baseDelay?: number
  /** Maximum delay in milliseconds (default: 2000) */
  maxDelay?: number
  /** Maximum jitter in milliseconds (default: 100) */
  maxJitter?: number
  /** Error codes to retry on (default: [112]) - MongoDB WriteConflict */
  retryableErrorCodes?: number[]
  /** Error code names to retry on (default: ['WriteConflict']) */
  retryableErrorNames?: string[]
  /** Context name for logging (e.g., 'Webhook', 'Status Route') */
  context?: string
  /** Whether to throw error after exhausting retries (default: true) */
  throwOnFailure?: boolean
}

export async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelay = 100,
    maxDelay = 2000,
    maxJitter = 100,
    retryableErrorCodes = [112],
    retryableErrorNames = ['WriteConflict'],
    context = 'Operation',
    throwOnFailure = true,
  } = options

  let retries = maxRetries
  let attempt = 0

  while (retries >= 0) {
    try {
      const result = await operation()
      if (attempt > 0) {
        console.log(`[${context}] ✅ Succeeded after ${attempt} ${attempt === 1 ? 'retry' : 'retries'}`)
      }
      return result
    } catch (error: any) {
      attempt++
      retries--

      const isRetryable =
        retryableErrorCodes.includes(error.code) ||
        retryableErrorNames.includes(error.codeName)

      if (!isRetryable || retries < 0) {
        // Non-retryable error or exhausted retries
        if (throwOnFailure) {
          if (retries < 0) {
            console.error(`[${context}] ❌ Failed after ${maxRetries} retries`)
          }
          throw error
        } else {
          console.warn(`[${context}] ⚠️ Operation failed:`, error.message)
          return undefined as T
        }
      }

      // Calculate exponential backoff with jitter
      const exponentialDelay = Math.pow(2, attempt) * baseDelay
      const jitter = Math.random() * maxJitter
      const delay = Math.min(exponentialDelay + jitter, maxDelay)

      console.log(
        `[${context}] ⚠️ ${error.codeName || `Error ${error.code}`} (attempt ${attempt}/${maxRetries}), ` +
        `retry in ${delay.toFixed(0)}ms... (${retries} ${retries === 1 ? 'retry' : 'retries'} left)`
      )

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // This should never be reached due to the logic above, but TypeScript needs it
  throw new Error(`[${context}] Unexpected error: retry loop exited without result`)
}
