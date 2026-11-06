import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaymentStatus } from '@/features/payment/use-payment-status'
import { ApiError } from '@/lib/api/errors'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import { PAYMENT_UUID } from './fixtures'

// The polling policy (Plan 4 Global Constraints; order digest §5.11): the first read at once,
// then 15 s ×4, 30 s ×4 and 60 s on; stopped after 15 minutes; paused while the page is hidden
// (resumed where it was); a 429's `retry_after` honoured; over at a final status; one read in
// flight at a time. Always with the session: whoever holds the uuid reads the payment
// (BACKEND-ISSUES M-7, fixed), so there is no second read without it.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const STATUS = `payment/${PAYMENT_UUID}/status/`
const answer = (status: string) =>
  Promise.resolve({ data: { ...cancelled.data, status }, msg: '', status: 200 })
const reads = () => mocks.bffFetch.mock.calls.filter(([path]) => path === STATUS)

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
const seconds = (n: number) => wait(n * 1000)
const show = async (isHidden: boolean) => {
  hidden = isHidden
  await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
}

describe('the schedule', () => {
  it('reads at once, then 4 reads 15 s apart, then 30 s, then 60 s, and stops after 15 minutes', async () => {
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    expect(reads()).toHaveLength(1)
    expect(result.current).toMatchObject({ stopped: false, final: false, unreadable: false })
    expect(result.current.info?.status).toBe('pending')
    for (let read = 2; read <= 5; read++) {
      await seconds(14.999)
      expect(reads()).toHaveLength(read - 1)
      await wait(1)
      expect(reads()).toHaveLength(read)
    }
    // 60 s in: four more, 30 s apart.
    await seconds(29)
    expect(reads()).toHaveLength(5)
    await seconds(1)
    expect(reads()).toHaveLength(6)
    await seconds(90)
    expect(reads()).toHaveLength(9)
    // 180 s in: 60 s apart from here.
    await seconds(59)
    expect(reads()).toHaveLength(9)
    await seconds(1)
    expect(reads()).toHaveLength(10)
    // The last read at 15 minutes (900 s), then no more: «نتیجه هنوز مشخص نیست».
    await seconds(900 - 240)
    expect(reads()).toHaveLength(21)
    expect(result.current.stopped).toBe(true)
    await seconds(30 * 60)
    expect(reads()).toHaveLength(21)
  })

  it('is over at a final status', async () => {
    mocks.bffFetch.mockImplementationOnce(() => answer('pending'))
    mocks.bffFetch.mockImplementationOnce(() => answer('pending'))
    mocks.bffFetch.mockImplementationOnce(() => answer('settled'))
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    await seconds(30)
    expect(result.current).toMatchObject({ final: true, stopped: false })
    expect(result.current.info?.status).toBe('settled')
    await seconds(15 * 60)
    expect(reads()).toHaveLength(3)
  })

  it.each(['failed', 'cancelled', 'refunded'])('%s is final too', async (status) => {
    mocks.bffFetch.mockImplementation(() => answer(status))
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    expect(result.current.final).toBe(true)
    await seconds(15 * 60)
    expect(reads()).toHaveLength(1)
  })

  it('keeps one read in flight at a time', async () => {
    mocks.bffFetch.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    expect(result.current.reading).toBe(true)
    await seconds(10 * 60)
    act(() => result.current.check())
    expect(reads()).toHaveLength(1)
  })

  it('reads nothing without a payment', async () => {
    const { result } = renderHook(() => usePaymentStatus(null))
    await seconds(60)
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ info: null, reading: false, stopped: false })
  })
})

describe('a hidden page', () => {
  it('pauses, then reads at once when shown and goes on where it was', async () => {
    renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    await seconds(60)
    expect(reads()).toHaveLength(5)
    await show(true)
    await seconds(5 * 60)
    expect(reads()).toHaveLength(5)
    await show(false)
    expect(reads()).toHaveLength(6)
    // The schedule goes on (the 30 s waits), not from its first 15 s again.
    await seconds(15)
    expect(reads()).toHaveLength(6)
    await seconds(15)
    expect(reads()).toHaveLength(7)
  })

  it('hidden past the 15 minutes: shown again, it stops without reading', async () => {
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    await seconds(60)
    expect(reads()).toHaveLength(5)
    await show(true)
    await seconds(20 * 60)
    await show(false)
    expect(reads()).toHaveLength(5)
    expect(result.current.stopped).toBe(true)
    // «بررسی دوباره» still reads once.
    act(() => result.current.check())
    await flush()
    expect(reads()).toHaveLength(6)
  })
})

describe('refusals', () => {
  it('a 429 waits its retry_after', async () => {
    mocks.bffFetch.mockImplementationOnce(() => answer('pending'))
    mocks.bffFetch.mockImplementationOnce(() =>
      Promise.reject(new ApiError({ status: 429, code: 'throttled', retryAfter: 120 })),
    )
    renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    await seconds(15)
    expect(reads()).toHaveLength(2)
    await seconds(119)
    expect(reads()).toHaveLength(2)
    await seconds(1)
    expect(reads()).toHaveLength(3)
  })

  it('reads with the session, never asking again without it (BACKEND-ISSUES M-7)', async () => {
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    expect(reads()).toHaveLength(1)
    expect(reads()[0]?.[1]?.query).toBeUndefined()
    expect(result.current.info?.status).toBe('pending')
  })

  it.each<[string, ApiError]>([
    ['a 404', new ApiError({ status: 404, code: 'payment_not_found' })],
    ['a 403 (none comes any more)', new ApiError({ status: 403, code: 'payment_forbidden' })],
  ])('%s: it cannot be read here; no more reads', async (_, error) => {
    mocks.bffFetch.mockImplementationOnce(() => Promise.reject(error))
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    expect(result.current.unreadable).toBe(true)
    await seconds(15 * 60)
    expect(reads()).toHaveLength(1)
  })

  it('no answer: the schedule goes on', async () => {
    mocks.bffFetch.mockImplementationOnce(() =>
      Promise.reject(new ApiError({ status: 0, code: 'network_error' })),
    )
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    expect(result.current).toMatchObject({ info: null, unreadable: false })
    await seconds(15)
    expect(result.current.info?.status).toBe('pending')
  })
})

describe('«بررسی دوباره» after the reads stopped', () => {
  it('reads once, and starts no new schedule', async () => {
    const { result } = renderHook(() => usePaymentStatus(PAYMENT_UUID))
    await flush()
    await seconds(15 * 60)
    expect(result.current.stopped).toBe(true)
    const before = reads().length
    mocks.bffFetch.mockImplementationOnce(() => answer('pending'))
    act(() => result.current.check())
    await flush()
    expect(reads()).toHaveLength(before + 1)
    expect(result.current.stopped).toBe(true)
    await seconds(15 * 60)
    expect(reads()).toHaveLength(before + 1)
    mocks.bffFetch.mockImplementationOnce(() => answer('settled'))
    act(() => result.current.check())
    await flush()
    expect(result.current).toMatchObject({ final: true })
  })
})
