import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY } from '@/features/payment/result-copy'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { PAYMENT_UUID } from './fixtures'
import { arrive, renderResult, serve, status, statusReads } from './result-support'

// The bank's return page (order digest §4.2, §5.10–5.12): the payment's status decides what it
// says, the return's `result` and `code` only the words; opened on another device (no pending
// payment), `result=success` with the payment still pending says «در حال بررسی…», reads again
// and never claims success early (Review Focus #3). The uuid leaves the address bar at once and
// a reload still finds it; a return without one is said to be invalid.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))
vi.mock('@/features/payment/confetti', () => ({ burstConfetti: vi.fn() }))
vi.mock('@/components/ui/live-announcer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/live-announcer')>()),
  announce: mocks.announce,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/payment/callback/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.announce.mockReset()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

const heading = () => screen.getByRole('heading', { level: 1 })
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('the status is the truth (Review Focus #3)', () => {
  it('result=success on another device, still pending: checking, read again, success only once settled', async () => {
    vi.useFakeTimers()
    serve(mocks.bffFetch, [status(), status(), status({ status: 'settled' })])
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult()
    expect(heading()).toHaveTextContent('در حال بررسی پرداخت')
    expect(document.body).toHaveTextContent(COPY.verifying)
    expect(document.body).not.toHaveTextContent('موفقیت')
    await wait(15_000)
    expect(statusReads(mocks.bffFetch)).toHaveLength(2)
    expect(document.body).not.toHaveTextContent('موفقیت')
    await wait(15_000)
    expect(heading()).toHaveTextContent('پرداخت موفق')
    expect(document.body).toHaveTextContent(
      'پرداخت با موفقیت انجام شد. سفارش ۱۴۱۱۶۳۵۳۴۰ در حال انجام است.',
    )
    // Said once, politely, when it changed.
    expect(mocks.announce).toHaveBeenCalledTimes(1)
    expect(mocks.announce.mock.calls[0]![0]).toContain('پرداخت موفق')
    await wait(15 * 60_000)
    expect(statusReads(mocks.bffFetch)).toHaveLength(3)
  })

  it('the heading takes the focus on arrival; the page is not marked busy (its words say it)', async () => {
    serve(mocks.bffFetch, [status()])
    arrive(`?result=pending&payment=${PAYMENT_UUID}&code=gateway_verification_pending`)
    await renderResult()
    expect(heading()).toHaveFocus()
    expect(heading().closest('section')).not.toHaveAttribute('aria-busy')
  })

  it('failed + gateway_capture_not_bookable: the exact sentence, the order, its amount', async () => {
    serve(mocks.bffFetch, [
      status({ status: 'failed', failure_reason: 'gateway_capture_not_bookable' }),
    ])
    arrive(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_capture_not_bookable`)
    await renderResult()
    expect(document.body).toHaveTextContent(COPY.notBookable)
    expect(screen.getByText('۱۴۱۱۶۳۵۳۴۰')).toHaveAttribute('dir', 'ltr')
    expect(document.body).toHaveTextContent('۱٬۰۴۹٬۰۰۰ تومان')
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).not.toBeInTheDocument()
  })

  it('signed in and refused (403 payment_forbidden): read again without the session', async () => {
    serve(mocks.bffFetch, [
      new ApiError({ status: 403, code: 'payment_forbidden' }),
      status({ status: 'settled' }),
    ])
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult({ hasSession: true })
    expect(statusReads(mocks.bffFetch)[1]?.[1]).toMatchObject({ query: { anon: '1' } })
    expect(heading()).toHaveTextContent('پرداخت موفق')
  })
})

describe('a payment the bank never settled', () => {
  it('cancelled + payment_attempt_expired: the support line to call', async () => {
    serve(mocks.bffFetch, [
      status({ status: 'cancelled', failure_reason: 'payment_attempt_expired' }),
    ])
    arrive(`?result=pending&payment=${PAYMENT_UUID}&code=gateway_verification_pending`)
    await renderResult()
    expect(document.body).toHaveTextContent(COPY.expired)
    expect(screen.getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
  })
})

describe('the payment’s uuid out of the address bar', () => {
  it('is replaced at once, and a reload of what is left still reads the same payment', async () => {
    serve(mocks.bffFetch, [status()])
    arrive(`?result=pending&payment=${PAYMENT_UUID}&code=gateway_verification_pending`)
    const first = await renderResult()
    expect(window.location.pathname).toBe('/payment/callback/')
    expect(window.location.search).toBe('?result=pending&code=gateway_verification_pending')
    expect(window.location.href).not.toContain(PAYMENT_UUID)
    first.unmount()
    // The reload: the scrubbed address, this tab's copy.
    await renderResult()
    const reads = statusReads(mocks.bffFetch)
    expect(reads).toHaveLength(2)
    expect(reads[1]?.[0]).toBe(`payment/${PAYMENT_UUID}/status/`)
    expect(document.body).toHaveTextContent(COPY.verifying)
  })
})

describe('a return without a payment', () => {
  it('says the return was invalid, with the orders and tracking, and reads nothing', async () => {
    arrive('?result=failed&code=gateway_callback_invalid')
    await renderResult({ hasSession: true })
    expect(heading()).toHaveTextContent(COPY.invalid)
    expect(screen.getByRole('link', { name: 'سفارش\u{200C}های من' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })
})

describe('a wallet top-up', () => {
  it('settled: the wallet is charged, its balance read again, a link to it', async () => {
    serve(mocks.bffFetch, [
      status({ status: 'settled', applies_to: 'wallet_topup', order_code: null }),
    ])
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult({ hasSession: true })
    expect(document.body).toHaveTextContent(COPY.topUp)
    expect(await screen.findByText('۴۵٬۱۷۰٬۰۰۰ تومان')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'کیف پول من' })).toHaveAttribute(
      'href',
      '/account/wallet/',
    )
  })
})

describe('after 15 minutes', () => {
  it('stops with «نتیجه هنوز مشخص نیست» and «بررسی دوباره» reads once', async () => {
    vi.useFakeTimers()
    serve(mocks.bffFetch, [status()])
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult()
    await wait(15 * 60_000)
    expect(document.body).toHaveTextContent(COPY.stopped)
    const reads = statusReads(mocks.bffFetch).length
    act(() => screen.getByRole('button', { name: 'بررسی دوباره' }).click())
    await act(async () => {})
    expect(statusReads(mocks.bffFetch)).toHaveLength(reads + 1)
    await wait(15 * 60_000)
    expect(statusReads(mocks.bffFetch)).toHaveLength(reads + 1)
  })

  it('no read ever answered: stopped all the same, with «بررسی دوباره» and no "checks itself"', async () => {
    vi.useFakeTimers()
    serve(mocks.bffFetch, [new ApiError({ status: 0, code: 'network_error' })])
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult()
    expect(heading()).toHaveTextContent('در حال بررسی پرداخت')
    await wait(15 * 60_000)
    expect(heading()).toHaveTextContent('بررسی خودکار متوقف شد')
    expect(document.body).toHaveTextContent(COPY.stopped)
    expect(document.body).not.toHaveTextContent('خودکار دوباره بررسی می')
    expect(screen.getByRole('button', { name: 'بررسی دوباره' })).toBeInTheDocument()
  })
})
