import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending, savePending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import rejected from '../../fixtures/payment-status-receipt-rejected.json'
import {
  CARDS,
  calls,
  cards,
  fillReceipt,
  ok,
  RECEIPT,
  renderTransfer,
  serve,
  STATUS,
  status,
  stubTransferApis,
  submitButton,
  type Route,
} from './card-transfer-support'
import { PAYMENT_UUID } from './fixtures'

// A signed-in visitor paying another account's order by card transfer (order digest §3.2.7–3.2.8,
// §11 #7): with the session the API refuses the payment (403 `payment_forbidden`) and answers the
// same calls made anonymously. The page reads the status and the cards again without the session
// (`?anon=1`), and from then on makes every call that way, the receipt included; it offers none of
// the account's pages for that payment. A refusal that stays without the session: the calm page.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), loadPage: vi.fn(), probe: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('@/features/payment/card-transfer/receipt-image', () => ({ probeImage: mocks.probe }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payment/card-transfer/x/',
}))

stubTransferApis()

const HISTORY = `payment/history/${PAYMENT_UUID}/`
const ORDER = 'order/1411635340/'
const RECEIPT_201 = {
  uuid: '7c2e0f5a-1b3d-4e6f-8a9b-0c1d2e3f4a5b',
  status: 'awaiting_review',
  paid_at: '2026-10-18T09:30:00+03:30',
  image_thumbnail: null,
  rejection_reason_code: null,
  rejection_reason: '',
  reviewed_at: null,
}
const forbidden = () => Promise.reject(new ApiError({ status: 403, code: 'payment_forbidden' }))
const isAnon = (init: Record<string, unknown>) =>
  (init.query as Record<string, string> | undefined)?.anon === '1'
/** Refused with the session, answered without it. */
const onlyAnonymous =
  (answer: () => Promise<unknown>): Route =>
  (init) =>
    isAnon(init) ? answer() : forbidden()
const anonCalls = (path: string) => calls(mocks.bffFetch, path).filter(([, init]) => isAnon(init))
const accountLinks = () => document.querySelectorAll('a[href^="/account/"]')

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.loadPage.mockReset()
  mocks.probe.mockReset()
  mocks.probe.mockResolvedValue({ ok: true, width: 1080, height: 1920 })
})

describe('refused with the session, answered without it', () => {
  it('the status and the cards are read again anonymously: the form, not the calm page', async () => {
    serve(mocks.bffFetch, {
      [STATUS]: onlyAnonymous(() => ok(status())),
      [CARDS]: onlyAnonymous(() => ok(cards())),
    })
    await renderTransfer({ hasSession: true })
    expect(screen.getByRole('button', { name: 'ثبت رسید' })).toBeVisible()
    expect(screen.getByRole('article', { name: 'بانک ملت' })).toBeVisible()
    expect(anonCalls(STATUS)).toHaveLength(1)
    expect(anonCalls(CARDS)).toHaveLength(1)
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(0)
  })

  it('the receipt then goes without the session at once, once; the outcome offers tracking', async () => {
    const user = userEvent.setup()
    const receipt = vi.fn(onlyAnonymous(() => ok(RECEIPT_201, 201)))
    serve(mocks.bffFetch, {
      [STATUS]: onlyAnonymous(() => ok(status())),
      [CARDS]: onlyAnonymous(() => ok(cards())),
      [RECEIPT]: receipt,
    })
    await renderTransfer({ hasSession: true })
    await fillReceipt(user)
    await user.click(submitButton())
    expect(
      await screen.findByRole('heading', { level: 1, name: 'رسید ثبت شد و در صف بررسی است' }),
    ).toBeVisible()
    expect(receipt).toHaveBeenCalledTimes(1)
    expect(anonCalls(RECEIPT)).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(accountLinks()).toHaveLength(0)
  })

  it('the outcome’s status reads go without the session from the first: no 403 again', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [STATUS]: onlyAnonymous(() => ok(status())),
      [CARDS]: onlyAnonymous(() => ok(cards())),
      [RECEIPT]: onlyAnonymous(() => ok(RECEIPT_201, 201)),
    })
    await renderTransfer({ hasSession: true })
    await fillReceipt(user)
    await user.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'رسید ثبت شد و در صف بررسی است' })
    await act(async () => {})
    const reads = calls(mocks.bffFetch, STATUS)
    // The page's first read (refused with the session, then anonymous), then the outcome's own.
    expect(reads.filter(([, init]) => !isAnon(init))).toHaveLength(1)
    expect(reads.filter(([, init]) => isAnon(init))).toHaveLength(2)
  })

  it('read with the session, a receipt refused (403) is sent once more without it', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [RECEIPT]: onlyAnonymous(() => ok(RECEIPT_201, 201)),
      [ORDER]: () => Promise.reject(new ApiError({ status: 404, code: 'not_found' })),
    })
    await renderTransfer({ hasSession: true })
    await fillReceipt(user)
    await user.click(submitButton())
    expect(
      await screen.findByRole('heading', { level: 1, name: 'رسید ثبت شد و در صف بررسی است' }),
    ).toBeVisible()
    const sent = calls(mocks.bffFetch, RECEIPT)
    expect(sent).toHaveLength(2)
    expect(isAnon(sent[0]![1])).toBe(false)
    expect(isAnon(sent[1]![1])).toBe(true)
    // The same picture and fields both times.
    const form = (index: number) => sent[index]![1].formData as FormData
    expect(form(1).get('payer_card_last_digits')).toBe(form(0).get('payer_card_last_digits'))
    expect(form(1).get('image')).toBe(form(0).get('image'))
  })

  it('a card refused at upload: the cards are read again without the session', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [STATUS]: onlyAnonymous(() => ok(status())),
      [CARDS]: onlyAnonymous(() => ok(cards())),
      [RECEIPT]: () =>
        Promise.reject(new ApiError({ status: 400, code: 'payment_destination_card_invalid' })),
    })
    await renderTransfer({ hasSession: true })
    await fillReceipt(user)
    await user.click(submitButton())
    await act(async () => {})
    const reads = calls(mocks.bffFetch, CARDS)
    // Refused, then anonymous; the re-read anonymous at once.
    expect(reads).toHaveLength(3)
    expect(isAnon(reads[2]![1])).toBe(true)
  })

  it('a refusal that stays without the session: the calm page, which can copy its own link', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, { [STATUS]: forbidden, [CARDS]: forbidden })
    await renderTransfer({ hasSession: true })
    expect(
      screen.getByRole('heading', { level: 1, name: 'این پرداخت از حساب کاربری دیگری است' }),
    ).toBeVisible()
    expect(anonCalls(CARDS)).toHaveLength(1)
    // Its own chunk, fetched for this refusal only.
    await user.click(await screen.findByRole('button', { name: /کپی لینک این صفحه/ }))
    expect(await navigator.clipboard.readText()).toBe(window.location.href)
    expect(screen.getByRole('button', { name: /کپی شد/ })).toBeVisible()
  })
})

describe('signed in, the status read anonymously after a 403 (another account’s order)', () => {
  it('a rejected receipt: no history read, the SMS sentence and tracking, no account links', async () => {
    savePending(PAYMENT_UUID, {
      kind: 'order',
      orderCode: '1411635340',
      orderUuid: '5e1c0a2b-3d4e-4f60-8a1b-2c3d4e5f6a7b',
      route: 'card_transfer',
      amount: 1_049_000,
      startedAt: Date.now(),
    })
    serve(mocks.bffFetch, {
      [STATUS]: onlyAnonymous(() => ok(rejected.data)),
      [CARDS]: onlyAnonymous(() => ok(cards())),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 1, name: 'رسید پذیرفته نشد' })).toBeVisible()
    expect(screen.getByText(/دلیل رد رسید با پیامک برایتان فرستاده شده است/)).toBeVisible()
    expect(calls(mocks.bffFetch, HISTORY)).toHaveLength(0)
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(accountLinks()).toHaveLength(0)
    // The owner's door (the order's uuid) is not this account's: no «پرداخت دوباره» through it.
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).toBeNull()
  })
})

describe('a status 404 with the cards answered', () => {
  it('the calm page («پیدا نشد»), and the pending entry is kept (the cards exist)', async () => {
    savePending(PAYMENT_UUID, {
      kind: 'order',
      orderCode: '1411635340',
      linkToken: 'tok',
      route: 'card_transfer',
      amount: 1_049_000,
      startedAt: Date.now(),
    })
    serve(mocks.bffFetch, {
      [STATUS]: () => Promise.reject(new ApiError({ status: 404, code: 'payment_not_found' })),
    })
    await renderTransfer()
    expect(screen.getByRole('heading', { level: 1, name: 'این پرداخت پیدا نشد' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'ثبت رسید' })).toBeNull()
    expect(getPending(PAYMENT_UUID)).not.toBeNull()
  })
})
