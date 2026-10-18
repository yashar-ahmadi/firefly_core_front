import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTEMPT_POLL_DELAYS_MS, useAttemptStatus } from '@/features/payment/use-attempt-status'
import { ApiError } from '@/lib/api/errors'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import { PAYMENT_UUID } from './fixtures'

// The verification's status while the open-attempt panel waits (order digest §5.9 row 3,
// §5.11): read at once, then 15 s ×4 and 30 s ×4, then it stops; paused while the page is
// hidden; a 429's `retry_after` honoured; a 403/404 stops it. Bounded and minimal on purpose
// (Task 5's polling replaces it).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const STATUS = `payment/${PAYMENT_UUID}/status/`
const answer = (status: string) =>
  Promise.resolve({ data: { ...cancelled.data, status }, msg: '', status: 200 })
const reads = () => mocks.bffFetch.mock.calls.filter(([path]) => path === STATUS).length

let hidden = false
beforeEach(() => {
  vi.useFakeTimers()
  hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  mocks.bffFetch.mockReset()
  mocks.bffFetch.mockImplementation(() => answer('pending'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const flush = () => act(async () => {})
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('useAttemptStatus', () => {
  it('reads at once, then 15 s ×4 and 30 s ×4, then stops and says so', async () => {
    const { result } = renderHook(() => useAttemptStatus(PAYMENT_UUID, true))
    await flush()
    expect(reads()).toBe(1)
    await wait(14_999)
    expect(reads()).toBe(1)
    await wait(1)
    expect(reads()).toBe(2)
    for (const delay of ATTEMPT_POLL_DELAYS_MS.slice(1)) await wait(delay)
    expect(reads()).toBe(9)
    expect(result.current).toMatchObject({ status: 'pending', exhausted: true })
    await wait(10 * 60_000)
    expect(reads()).toBe(9)
  })

  it('stops as soon as the payment is no longer pending', async () => {
    mocks.bffFetch.mockImplementationOnce(() => answer('pending'))
    mocks.bffFetch.mockImplementationOnce(() => answer('settled'))
    const { result } = renderHook(() => useAttemptStatus(PAYMENT_UUID, true))
    await flush()
    await wait(15_000)
    expect(result.current.status).toBe('settled')
    await wait(5 * 60_000)
    expect(reads()).toBe(2)
  })

  it('waits while the page is hidden and reads again when it shows', async () => {
    renderHook(() => useAttemptStatus(PAYMENT_UUID, true))
    await flush()
    hidden = true
    await wait(5 * 60_000)
    expect(reads()).toBe(1)
    hidden = false
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    expect(reads()).toBe(2)
  })

  it('honours a 429’s retry_after', async () => {
    mocks.bffFetch.mockImplementationOnce(() =>
      Promise.reject(new ApiError({ status: 429, code: 'throttled', retryAfter: 40 })),
    )
    renderHook(() => useAttemptStatus(PAYMENT_UUID, true))
    await flush()
    await wait(39_000)
    expect(reads()).toBe(1)
    await wait(1_000)
    expect(reads()).toBe(2)
  })

  it('a payment it cannot read (403) stops it: unreadable', async () => {
    mocks.bffFetch.mockImplementation(() =>
      Promise.reject(new ApiError({ status: 403, code: 'payment_forbidden' })),
    )
    const { result } = renderHook(() => useAttemptStatus(PAYMENT_UUID, true))
    await flush()
    expect(result.current.unreadable).toBe(true)
    await wait(5 * 60_000)
    expect(reads()).toBe(1)
  })

  it('reads nothing while not wanted', async () => {
    renderHook(() => useAttemptStatus(PAYMENT_UUID, false))
    await wait(60_000)
    expect(reads()).toBe(0)
  })
})
