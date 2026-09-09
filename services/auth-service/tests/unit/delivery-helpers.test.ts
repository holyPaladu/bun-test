import { describe, expect, test } from 'bun:test'
import { EventDeliveryError, isRetryableDeliveryError } from '@/modules/integration-events/outgoing/errors/event-delivery.error'
import { errorMessage } from '@/modules/integration-events/outgoing/helpers/error-message'
import { getRetryDelayMs, shouldDeadLetter } from '@/modules/integration-events/outgoing/helpers/retry-policy'

describe('retry policy', () => {
  const policy = { maxAttempts: 3, baseRetryMs: 100, maxRetryMs: 1_000 }

  test('grows exponentially and caps the delay before jitter', () => {
    expect([0, 1, 2, 3, 5, 20].map(attempt => getRetryDelayMs(attempt, policy, () => 0.5)))
      .toEqual([100, 100, 200, 400, 1_000, 1_000])
  })

  test('preserves default and configured jitter, including at the cap', () => {
    expect(getRetryDelayMs(1, policy, () => 0)).toBe(80)
    expect(getRetryDelayMs(1, policy, () => 1)).toBe(120)
    expect(getRetryDelayMs(20, policy, () => 1)).toBe(1_200)
    expect(getRetryDelayMs(2, { ...policy, jitterRatio: 0.1 }, () => 0)).toBe(180)
    expect(getRetryDelayMs(2, { ...policy, jitterRatio: 0 }, () => 1)).toBe(200)
    expect(getRetryDelayMs(1, { ...policy, jitterRatio: 2 }, () => 0)).toBe(0)
  })

  test('dead-letters permanent failures immediately and transient failures at the limit', () => {
    expect(shouldDeadLetter(1, 3, false)).toBe(true)
    expect(shouldDeadLetter(2, 3, true)).toBe(false)
    expect(shouldDeadLetter(3, 3, true)).toBe(true)
    expect(shouldDeadLetter(4, 3, true)).toBe(true)
  })
})

describe('delivery errors', () => {
  test('honors transport classification and retries unknown failures', () => {
    expect(isRetryableDeliveryError(new EventDeliveryError('permanent', false))).toBe(false)
    expect(isRetryableDeliveryError(new EventDeliveryError('temporary', true))).toBe(true)
    expect(isRetryableDeliveryError(new Error('network'))).toBe(true)
    expect(isRetryableDeliveryError('unknown')).toBe(true)
  })

  test('formats unknown values and bounds error messages', () => {
    expect(errorMessage(new Error('failure'))).toBe('failure')
    expect(errorMessage(null)).toBe('null')
    expect(errorMessage(undefined)).toBe('undefined')
    expect(errorMessage('x'.repeat(1_001))).toBe('x'.repeat(1_000))
    expect(errorMessage(new Error('x'.repeat(1_001)))).toBe('x'.repeat(1_000))
  })
})
