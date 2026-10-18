import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending, savePending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import linkOpenCard from '../../fixtures/order-pay-link-open-card.json'
import {
  CARDS,
  calls,
  cards,
  ok,
  renderTransfer,
  serve,
  STATUS,
  status,
  stubTransferApis,
} from './card-transfer-support'
import { LINK_TOKEN, PAYMENT_UUID } from './fixtures'

// `/payment/card-transfer/<uuid>/` (order digest §5.7 step 2): the cards ALWAYS read from
// `card-transfer/` (never an intent's answer, §0 #11), each with its bank, holder and copyable
// numbers; the amount; the route's instruction (sanitised on the server); the attempt's real
// cut-off when the order's link can be read, else the order's deadline said as such; and the calm
// page or a closed attempt when the payment cannot be paid here.

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

const LINK = `order/pay/${LINK_TOKEN}/`
const ORDER = 'order/1411635340/'

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  serve(mocks.bffFetch)
})
afterEach(() => vi.restoreAllMocks())

const keepToken = () =>
  savePending(PAYMENT_UUID, {
    kind: 'order',
    orderCode: '1411635340',
    linkToken: LINK_TOKEN,
    route: 'card_transfer',
    amount: 1_049_000,
    startedAt: Date.now(),
  })

describe('the cards', () => {
  it('are read from card-transfer/ and shown: bank, holder, the number in fours, sheba, account', async () => {
    keepToken()
    await renderTransfer()
    expect(calls(mocks.bffFetch, CARDS)).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'پرداخت کارت به کارت' })).toBeVisible()
    expect(screen.getByText('۱٬۰۴۹٬۰۰۰ تومان')).toBeVisible()
    const mellat = screen.getByRole('article', { name: 'بانک ملت' })
    expect(within(mellat).getByText('به نام فروشگاه فایرفلای')).toBeVisible()
    const number = within(mellat).getByText('۶۱۰۴ ۳۳۷۸ ۱۲۳۴ ۵۶۷۸')
    expect(number).toHaveAttribute('dir', 'ltr')
    expect(within(mellat).getByText('IR۶۲ ۰۱۲۰ ۰۰۰۰ ۰۰۰۰ ۱۲۳۴ ۵۶۷۸ ۹۰')).toBeVisible()
    expect(within(mellat).getByText('۱۲۳۴۵۶۷۸۹۰')).toBeVisible()
    expect(screen.getByRole('article', { name: 'بانک سامان' })).toBeVisible()
  })

  it('are read again on every visit (never kept from an intent or an earlier read)', async () => {
    keepToken()
    const { unmount } = await renderTransfer()
    unmount()
    await renderTransfer()
    expect(calls(mocks.bffFetch, CARDS)).toHaveLength(2)
    expect(screen.getByRole('article', { name: 'بانک ملت' })).toBeVisible()
  })

  it('copy buttons name what they copy, copy the bare value and say so politely', async () => {
    const user = userEvent.setup()
    await renderTransfer()
    await user.click(screen.getByRole('button', { name: 'کپی شماره کارت بانک ملت' }))
    expect(await navigator.clipboard.readText()).toBe('6104337812345678')
    await user.click(screen.getByRole('button', { name: 'کپی شماره شبای بانک سامان' }))
    expect(await navigator.clipboard.readText()).toBe('IR350560000000001234567891')
    await user.click(screen.getByRole('button', { name: 'کپی شماره حساب بانک ملت' }))
    expect(await navigator.clipboard.readText()).toBe('1234567890')
    expect(screen.getByRole('button', { name: 'کپی شد شماره حساب بانک ملت' })).toBeVisible()
  })

  it('the instruction: the server’s sanitised HTML; without one, the cards read’s text as text', async () => {
    const { unmount } = await renderTransfer({ instruction: '<p>پس از <strong>واریز</strong></p>' })
    expect(screen.getByText('واریز', { selector: 'strong' })).toBeVisible()
    unmount()
    serve(mocks.bffFetch, { [CARDS]: () => ok(cards({ instruction: '<b>رسید</b> را بفرستید' })) })
    await renderTransfer({ instruction: undefined })
    expect(screen.getByText('رسید را بفرستید')).toBeVisible()
    expect(document.querySelector('b')).toBeNull()
  })

  it('one card is chosen for the shopper; two are left to choose', async () => {
    serve(mocks.bffFetch, {
      [CARDS]: () => ok(cards({ destination_cards: cards().destination_cards.slice(0, 1) })),
    })
    const { unmount } = await renderTransfer()
    expect(screen.getByRole('radio', { name: /بانک ملت/ })).toBeChecked()
    unmount()
    serve(mocks.bffFetch)
    await renderTransfer()
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  })
})

describe('the cut-off', () => {
  it('the attempt’s own, from the order’s link page, when this device holds its token', async () => {
    keepToken()
    serve(mocks.bffFetch, { [LINK]: () => ok(linkOpenCard.data) })
    await renderTransfer()
    await act(async () => {})
    expect(calls(mocks.bffFetch, LINK)).toHaveLength(1)
    const line = screen.getByText('مهلت واریز و ثبت رسید:').closest('p')!
    expect(line.querySelector('time')).toHaveAttribute(
      'dateTime',
      linkOpenCard.data.open_attempt.expires_at,
    )
    expect(screen.queryByText(/ممکن است زودتر از مهلت سفارش/)).toBeNull()
  })

  it('only the order’s deadline known (no token here): said as the order’s, with a note', async () => {
    await renderTransfer()
    expect(calls(mocks.bffFetch, LINK)).toHaveLength(0)
    const line = screen.getByText('مهلت پرداخت سفارش:').closest('p')!
    expect(line.querySelector('time')).toHaveAttribute('dateTime', cards().expires_at)
    expect(screen.getByText(/ممکن است زودتر از مهلت سفارش بسته شود/)).toBeVisible()
  })

  it('a signed-in owner: the order read by its code gives the link, the link the cut-off', async () => {
    serve(mocks.bffFetch, {
      [ORDER]: () =>
        ok({ uuid: 'f00d', payment_url: `http://localhost:3000/order/pay/${LINK_TOKEN}` }),
      [LINK]: () => ok(linkOpenCard.data),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(1)
    expect(screen.getByText('مهلت واریز و ثبت رسید:')).toBeVisible()
  })
})

describe('when it cannot be paid here', () => {
  it.each([
    ['404', new ApiError({ status: 404, code: 'payment_not_found' }), 'این پرداخت پیدا نشد'],
    [
      '403',
      new ApiError({ status: 403, code: 'payment_forbidden' }),
      'این پرداخت از حساب کاربری دیگری است',
    ],
  ])('%s: a calm page with tracking and the support line', async (_, error, title) => {
    keepToken()
    serve(mocks.bffFetch, { [CARDS]: () => Promise.reject(error) })
    await renderTransfer()
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
    expect(screen.getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(screen.getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
    expect(screen.queryByRole('button', { name: 'ثبت رسید' })).toBeNull()
    // No such payment: its pending entry is stale and goes; another account's stays.
    expect(getPending(PAYMENT_UUID) === null).toBe(error.status === 404)
  })

  it('no active card left: no form, the support line and «انصراف»', async () => {
    serve(mocks.bffFetch, { [CARDS]: () => ok(cards({ destination_cards: [] })) })
    await renderTransfer()
    expect(screen.getByRole('alert')).toHaveTextContent('فروشگاه اکنون کارتی برای واریز ندارد')
    expect(screen.queryByRole('button', { name: 'ثبت رسید' })).toBeNull()
    expect(screen.getByRole('button', { name: 'انصراف از کارت به کارت' })).toBeVisible()
  })

  it('no answer: «تلاش دوباره» reads both again', async () => {
    const user = userEvent.setup()
    let fail = true
    serve(mocks.bffFetch, {
      [CARDS]: () => (fail ? Promise.reject(ApiError.network()) : ok(cards())),
    })
    await renderTransfer()
    expect(
      screen.getByRole('heading', { level: 1, name: 'اطلاعات پرداخت خوانده نشد' }),
    ).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('button', { name: 'ثبت رسید' })).toBeInTheDocument()
    expect(calls(mocks.bffFetch, CARDS)).toHaveLength(2)
    expect(calls(mocks.bffFetch, STATUS)).toHaveLength(2)
  })

  it('not a card transfer, or no longer open (400 payment_target_invalid): closed, pay again', async () => {
    keepToken()
    serve(mocks.bffFetch, {
      [CARDS]: () => Promise.reject(new ApiError({ status: 400, code: 'payment_target_invalid' })),
    })
    await renderTransfer()
    expect(screen.getByRole('heading', { level: 1, name: 'این پرداخت بسته شده است' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'پرداخت دوباره' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'پرداخت با روش دیگر' })).toHaveAttribute(
      'href',
      `/order/pay/${LINK_TOKEN}/`,
    )
  })

  it('a receipt already under review on arrival: the outcome, no form', async () => {
    serve(mocks.bffFetch, { [STATUS]: () => ok(status({ status: 'awaiting_review' })) })
    await renderTransfer()
    expect(
      screen.getByRole('heading', { level: 1, name: 'رسید ثبت شد و در صف بررسی است' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'ثبت رسید' })).toBeNull()
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
  })
})
