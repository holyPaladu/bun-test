/** Pure delivery retry calculations; scheduling belongs to the caller. */
export interface RetryPolicy {
  maxAttempts: number
  baseRetryMs: number
  maxRetryMs: number
  jitterRatio?: number
}

export const getRetryDelayMs = (
  attemptCount: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number => {
  const exponential = Math.min(
    policy.maxRetryMs,
    policy.baseRetryMs * 2 ** Math.max(0, attemptCount - 1),
  )
  const ratio = policy.jitterRatio ?? 0.2
  const jitter = exponential * ratio * (random() * 2 - 1)
  return Math.max(0, Math.round(exponential + jitter))
}

export const shouldDeadLetter = (
  attemptCount: number,
  maxAttempts: number,
  retryable: boolean,
): boolean => !retryable || attemptCount >= maxAttempts
