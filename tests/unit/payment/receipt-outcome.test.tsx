import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending, savePending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import rejected from '../../fixtures/payment-status-receipt-rejected.json'
import {
  calls,
  ok,
  renderTransfer,
  serve,
  status,
  STATUS,
  stubTransferApis,
} from './card-transfer-support'
import { PAYMENT_UUID } from './fixtures'

// The receipt's outcome (order digest §5.7 steps 4–5, §5.11): polled under the policy until it is
// final; approved → the order under way, the pending entry gone; rejected → the reason for the
// signed-in owner (history detail), the honest SMS sentence for a guest, and «پرداخت دوباره»: a
// NEW card-transfer attempt with a new key, through the door this device knows, then its page.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), loadPage: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/payment/x/' }))

stubTransferApis()

const ORDER_UUID = '5e1c0a2b-3d4e-4f60-8a1b-2c3d4e5f6a7b'
const NEW_UUID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const HISTORY = `payment/history/${PAYMENT_UUID}/`
const INTENT = `payment/order/${ORDER_UUID}/intent/`
const isRejected = () => ok(rejected.data)
/** The order, read for this account: the signed-in visitor is its owner. */
const ORDER = 'order/1411635340/'
const mine = () => ok({ uuid: ORDER_UUID, payment_url: null })

const keepOrderDoor = () =>
  savePending(PAYMENT_UUID, {
    kind: 'order',
    orderCode: '1411635340',
    orderUuid: ORDER_UUID,
    route: 'card_transfer',
    amount: 1_049_000,
    startedAt: Date.now(),
  })

const detail = (receipt: Record<string, unknown> | null) => ({
  uuid: PAYMENT_UUID,
  status: 'failed',
  failure_reason: 'payment_receipt_rejected',
  order_code: '1411635340',
  card_transfer_receipt: receipt,
})

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.loadPage.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('under review, then the answer', () => {
  it('polls the status; approved: «رسید تأیید شد», the pending entry gone', async () => {
    vi.useFakeTimers()
    keepOrderDoor()
    let reads = 0
    serve(mocks.bffFetch, {
      [STATUS]: () => ok(status({ status: reads++ < 2 ? 'awaiting_review' : 'settled' })),
    })
    await renderTransfer({ hasSession: true })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'رسید ثبت شد و در صف بررسی است',
    )
    expect(screen.getByText(/خودکار می‌خواند/)).toBeVisible()
    await act(async () => void (await vi.advanceTimersByTimeAsync(15_000)))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('رسید تأیید شد')
    expect(
      screen.getByText('پرداخت سفارش ۱۴۱۱۶۳۵۳۴۰ ثبت شد و سفارش در حال انجام است.'),
    ).toBeVisible()
    expect(getPending(PAYMENT_UUID)).toBeNull()
    // Final: no more reads.
    const count = calls(mocks.bffFetch, STATUS).length
    await act(async () => void (await vi.advanceTimersByTimeAsync(120_000)))
    expect(calls(mocks.bffFetch, STATUS)).toHaveLength(count)
  })

  it('not answered within 15 minutes: stopped, «بررسی دوباره» reads once', async () => {
    vi.useFakeTimers()
    serve(mocks.bffFetch, { [STATUS]: () => ok(status({ status: 'awaiting_review' })) })
    await renderTransfer()
    await act(async () => void (await vi.advanceTimersByTimeAsync(16 * 60_000)))
    expect(screen.getByText(/هنوز اعلام نشده است/)).toBeVisible()
    const count = calls(mocks.bffFetch, STATUS).length
    await act(async () => screen.getByRole('button', { name: 'بررسی دوباره' }).click())
    expect(calls(mocks.bffFetch, STATUS)).toHaveLength(count + 1)
  })
})

describe('rejected', () => {
  it('signed in (the owner): the reason read from the history detail', async () => {
    keepOrderDoor()
    serve(mocks.bffFetch, {
      [STATUS]: isRejected,
      [ORDER]: mine,
      [HISTORY]: () =>
        ok(
          detail({
            uuid: 'r',
            status: 'rejected',
            paid_at: '2026-10-17T10:00:00+03:30',
            image_thumbnail: null,
            rejection_reason_code: 'amount_mismatch',
            rejection_reason: 'مبلغ واریزی با مبلغ سفارش مطابقت ندارد.',
            reviewed_at: '2026-10-18T09:00:00+03:30',
          }),
        ),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 1, name: 'رسید پذیرفته نشد' })).toBeVisible()
    expect(screen.getByText(/دلیل رد رسید: مغایرت مبلغ/)).toBeVisible()
    expect(screen.getByText('مبلغ واریزی با مبلغ سفارش مطابقت ندارد.')).toBeVisible()
    expect(screen.queryByText(/با پیامک برایتان فرستاده شده/)).toBeNull()
  })

  it('a guest: no history read; the reason came by SMS, with the support line', async () => {
    serve(mocks.bffFetch, { [STATUS]: isRejected })
    await renderTransfer()
    expect(screen.getByText(/دلیل رد رسید با پیامک برایتان فرستاده شده است/)).toBeVisible()
    expect(screen.getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })).toBeVisible()
    expect(calls(mocks.bffFetch, HISTORY)).toHaveLength(0)
    // Final on arrival: the first read is all there is (no second read for the poll).
    expect(calls(mocks.bffFetch, STATUS)).toHaveLength(1)
  })

  it('signed in, a receipt with neither a code nor a sentence: the SMS sentence', async () => {
    serve(mocks.bffFetch, {
      [STATUS]: isRejected,
      [ORDER]: mine,
      [HISTORY]: () =>
        ok(detail({ status: 'rejected', rejection_reason_code: null, rejection_reason: ' ' })),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByText(/دلیل رد رسید با پیامک برایتان فرستاده شده است/)).toBeVisible()
    expect(screen.queryByText(/^دلیل رد رسید:/)).toBeNull()
  })

  it('«پرداخت دوباره»: a new card-transfer attempt, a new key each press, then its page', async () => {
    const user = userEvent.setup()
    keepOrderDoor()
    let intents = 0
    serve(mocks.bffFetch, {
      [STATUS]: isRejected,
      [ORDER]: mine,
      [HISTORY]: () => ok(detail(null)),
      [INTENT]: () =>
        intents++ === 0
          ? Promise.reject(new ApiError({ status: 503, code: 'gateway_unavailable' }))
          : ok(
              {
                payment: status({ uuid: NEW_UUID }),
                status: 'pending',
                handoff: null,
                destination_cards: [],
                delivery_collection: null,
              },
              201,
            ),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    await user.click(screen.getByRole('button', { name: 'پرداخت دوباره' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    await user.dblClick(screen.getByRole('button', { name: 'پرداخت دوباره' }))
    const sent = calls(mocks.bffFetch, INTENT)
    expect(sent).toHaveLength(2)
    expect(sent.map(([, init]) => init.body)).toEqual([
      { route: 'card_transfer' },
      { route: 'card_transfer' },
    ])
    expect(sent[0]![1].idempotencyKey).not.toBe(sent[1]![1].idempotencyKey)
    expect(mocks.loadPage).toHaveBeenCalledWith(`/payment/card-transfer/${NEW_UUID}/`)
    expect(getPending(NEW_UUID)).toMatchObject({ orderUuid: ORDER_UUID, route: 'card_transfer' })
  })

  it('a card transfer still open on the order (409): its page, no second attempt', async () => {
    const user = userEvent.setup()
    keepOrderDoor()
    serve(mocks.bffFetch, {
      [STATUS]: isRejected,
      [ORDER]: mine,
      [HISTORY]: () => ok(detail(null)),
      [INTENT]: () =>
        Promise.reject(
          ApiError.fromBody(409, {
            msg: '',
            code: 409,
            data: {
              type: 'client_error',
              errors: [{ code: 'payment_attempt_open', detail: 'باز است', attr: null }],
              open_attempt: {
                payment: NEW_UUID,
                method: 'card_transfer',
                status: 'pending',
                amount: 1_049_000,
                expires_at: null,
                handoff: null,
                destination_cards: [],
              },
            },
          }),
        ),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    await user.click(screen.getByRole('button', { name: 'پرداخت دوباره' }))
    expect(mocks.loadPage).toHaveBeenCalledWith(`/payment/card-transfer/${NEW_UUID}/`)
  })
})
