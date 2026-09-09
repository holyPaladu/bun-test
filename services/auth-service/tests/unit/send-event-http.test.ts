import { describe, expect, mock, test } from 'bun:test'
import { createHttpEventSender } from '@/modules/integration-events/outgoing/http/send-event.http'
import { EventDeliveryError } from '@/modules/integration-events/outgoing/errors/event-delivery.error'
import { event } from '../helpers/outgoing-events'

const options = { url: 'http://consumer/internal/events', token: 'test-token', timeoutMs: 3_000 }

describe('HTTP event sender', () => {
  test.each([200, 201, 202, 204])('sends the envelope and accepts HTTP %i', async status => {
    const request = mock(async (_url: string, _init: RequestInit) => new Response(null, { status }))
    const sendEvent = createHttpEventSender({ ...options, fetch: request as unknown as typeof fetch })
    await sendEvent(event)
    expect(request).toHaveBeenCalledWith(options.url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify(event),
      signal: expect.any(AbortSignal),
    })
  })

  test.each([
    [408, true], [429, true], [500, true], [503, true],
    [400, false], [401, false], [403, false], [404, false], [422, false],
  ] as const)('classifies HTTP %i as retryable=%s', async (status, retryable) => {
    const request = mock(async () => new Response(null, { status }))
    const sendEvent = createHttpEventSender({ ...options, fetch: request as unknown as typeof fetch })
    const delivery = sendEvent(event)
    await expect(delivery).rejects.toBeInstanceOf(EventDeliveryError)
    await expect(delivery).rejects.toMatchObject({
      message: `Consumer responded with HTTP ${status}`, retryable,
    })
  })

  test('propagates a network failure to the delivery scenario', async () => {
    const failure = new TypeError('network down')
    const request = mock(async () => { throw failure })
    const sendEvent = createHttpEventSender({ ...options, fetch: request as unknown as typeof fetch })
    await expect(sendEvent(event)).rejects.toBe(failure)
  })
})
