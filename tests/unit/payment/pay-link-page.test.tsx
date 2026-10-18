import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import cancelledAttempt from '../../fixtures/payment-attempt-cancel.json'
import attemptOpen from '../../fixtures/payment-intent-attempt-open.json'
import notConfigured from '../../fixtures/payment-intent-not-configured.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { handoff, intent, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { cardAttempt, expiredAttempt, payLink } from './link-fixtures'
import {
  keysOf,
  LINK_INTENT,
  LINK_READ,
  ok,
  renderLink,
  routesReady,
  serve,
  type Route,
} from './pay-link-support'

// The payment link's page once it opened (order digest §3.1.9, §5.0, §5.3, §5.9; Review Focus
// #2): the order and its money split from the API's fields, the deadline, the routes for what is
// owed online (the wallet hidden for a guest, a login offered back to this page), one intent per
// double click through the link door, the bank's misconfiguration said without navigating, a pure
// pay-on-delivery order confirmed with «تأیید سفارش» alone, and an open attempt's resume UI
// instead of the routes («انصراف و پرداخت دوباره»: cancelled, then one new intent, a new key).

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  goToBank: vi.fn(),
  loadPage: vi.fn(),
  announce: vi.fn(),
}))
vi.mock('@/components/ui/live-announcer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/live-announcer')>()),
  announce: mocks.announce,
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => `/order/pay/${LINK_TOKEN}/`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.goToBank.mockReset()
  mocks.loadPage.mockReset()
  localStorage.clear()
  sessionStorage.clear()
})

const routes = () => screen.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
const payButton = () => screen.getByRole('button', { name: 'پرداخت سفارش' })

describe('a link awaiting payment', () => {
  it('shows the order, its money split, the deadline and the routes (no wallet for a guest)', async () => {
    serve(mocks.bffFetch)
    renderLink()
    await routesReady()
    expect(screen.getByRole('heading', { level: 1, name: 'پرداخت سفارش' })).toBeVisible()
    expect(document.querySelector('[data-order-code]')).toHaveAttribute('dir', 'ltr')
    expect(screen.getByText('۱۴۱۱۶۳۵۳۴۰')).toBeVisible()
    expect(screen.getByText('در انتظار پرداخت')).toBeVisible()
    expect(screen.getByText('۱ کالا')).toBeVisible()
    const money = document.querySelector('dl[aria-label="مبالغ سفارش"]')!
    expect(money).toHaveTextContent('مبلغ کل سفارش۱٬۰۴۹٬۰۰۰ تومان')
    expect(money).toHaveTextContent('مانده\u{0654} پرداخت آنلاین۱٬۰۴۹٬۰۰۰ تومان')
    expect(money).not.toHaveTextContent('پرداخت هنگام تحویل')
    expect(screen.getByText(/مهلت پرداخت:/)).toBeVisible()
    // The countdown speaks only at thresholds: never a live region of its own.
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off')
    expect(within(routes()).getByRole('radio', { name: /درگاه بانکی/ })).toBeChecked()
    expect(within(routes()).getByRole('radio', { name: /کارت به کارت/ })).toBeInTheDocument()
    expect(within(routes()).queryByRole('radio', { name: /کیف پول/ })).not.toBeInTheDocument()
    expect(within(routes()).queryByRole('radio', { name: /پرداخت در محل/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ورود برای استفاده از کیف پول' })).toHaveAttribute(
      'href',
      `/login/?next=/order/pay/${LINK_TOKEN}/`,
    )
    expect(screen.getByRole('button', { name: 'لغو سفارش' })).toBeVisible()
  })

  it('a double click on «پرداخت سفارش» opens one intent; the pending payment is saved first', async () => {
    const user = userEvent.setup()
    let savedFirst = false
    mocks.goToBank.mockImplementation(() => {
      savedFirst = getPending(PAYMENT_UUID) !== null
    })
    // The first press's answer is slow: the second press lands while it is on its way.
    let answer: (value: unknown) => void = () => {}
    const pay = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    serve(mocks.bffFetch, { [LINK_INTENT]: pay })
    renderLink()
    await routesReady()
    await user.dblClick(payButton())
    await user.click(payButton())
    answer(ok(intent('bank_gateway'), 201))
    await waitFor(() => expect(mocks.goToBank).toHaveBeenCalledWith(handoff()))
    expect(pay).toHaveBeenCalledTimes(1)
    expect(keysOf(pay)[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(savedFirst).toBe(true)
    expect(getPending(PAYMENT_UUID)).toMatchObject({
      linkToken: LINK_TOKEN,
      orderCode: '1411635340',
    })
    expect(await screen.findByText('در حال انتقال به زرین پال…')).toBeVisible()
  })

  it('the bank not configured: said with the support line, no navigation, card transfer left', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [LINK_INTENT]: () => Promise.reject(ApiError.fromBody(503, notConfigured)),
    })
    renderLink()
    await routesReady()
    await user.click(payButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('پرداخت با درگاه بانکی در این فروشگاه اکنون ممکن نیست')
    expect(within(alert).getByRole('link', { name: /پشتیبانی/ })).toBeVisible()
    expect(mocks.goToBank).not.toHaveBeenCalled()
    expect(mocks.loadPage).not.toHaveBeenCalled()
    expect(within(routes()).queryByRole('radio', { name: /درگاه بانکی/ })).not.toBeInTheDocument()
    expect(within(routes()).getByRole('radio', { name: /کارت به کارت/ })).toBeInTheDocument()
  })

  it('card to card: its page, a full page load (its URL holds the payment’s uuid)', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, { [LINK_INTENT]: async () => ok(intent('card_transfer'), 201) })
    renderLink()
    await routesReady()
    await user.click(within(routes()).getByRole('radio', { name: /کارت به کارت/ }))
    await user.click(payButton())
    await waitFor(() =>
      expect(mocks.loadPage).toHaveBeenCalledWith(`/payment/card-transfer/${PAYMENT_UUID}/`),
    )
    expect(getPending(PAYMENT_UUID)).toMatchObject({
      route: 'card_transfer',
      linkToken: LINK_TOKEN,
    })
  })
})

describe('nothing owed online (a pure pay-on-delivery order)', () => {
  it('offers «تأیید سفارش» alone; confirmed, the page says so', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn<Route>(async () =>
      ok(
        intent('pay_on_delivery', {
          payment: { ...intent('pay_on_delivery').payment!, amount: 1_049_000 },
        }),
        201,
      ),
    )
    serve(mocks.bffFetch, { [LINK_INTENT]: confirm })
    renderLink({
      link: payLink({
        amount_charged_online: 0,
        amount_outstanding_online: 0,
        amount_to_collect_on_delivery: 1_049_000,
        is_payable: false,
      }),
    })
    await routesReady()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    // The order exists: «تأیید سفارش» confirms it (never «after placement»).
    expect(screen.getByText(/با «تأیید سفارش» سفارش تأیید می\u{200C}شود/u)).toBeVisible()
    expect(document.body).not.toHaveTextContent('پس از ثبت')
    await user.dblClick(screen.getByRole('button', { name: 'تأیید سفارش' }))
    expect(await screen.findByRole('heading', { name: 'سفارش شما تأیید شد' })).toHaveFocus()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]![0]).toEqual({ route: 'pay_on_delivery' })
    expect(screen.getByText(/۱٬۰۴۹٬۰۰۰ تومان هنگام تحویل/)).toBeVisible()
  })
})

describe('an open attempt', () => {
  it('on the link: its resume UI instead of the routes', async () => {
    serve(mocks.bffFetch)
    renderLink({ link: payLink({ open_attempt: cardAttempt() }) })
    const panel = await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    expect(panel).toHaveTextContent('پرداخت کارت به کارت شما باز است')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('«انصراف و پرداخت دوباره»: cancelled, then one new intent with a new key', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn<Route>(async () => ok(cancelledAttempt.data))
    const pay = vi.fn<Route>(async () => ok(intent('bank_gateway'), 201))
    serve(mocks.bffFetch, { [`payment/${PAYMENT_UUID}/cancel/`]: cancel, [LINK_INTENT]: pay })
    renderLink({ link: payLink({ open_attempt: expiredAttempt() }) })
    const panel = await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    await user.dblClick(within(panel).getByRole('button', { name: 'انصراف و پرداخت دوباره' }))
    await waitFor(() => expect(mocks.goToBank).toHaveBeenCalledTimes(1))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(pay).toHaveBeenCalledTimes(1)
    expect(pay.mock.calls[0]![0]).toMatchObject({ route: 'bank_gateway' })
    expect(keysOf(pay)[0]).toBeTruthy()
  })

  it('a press that meets an attempt still open (409) shows its resume UI, never an error', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [LINK_INTENT]: () => Promise.reject(ApiError.fromBody(409, attemptOpen)),
    })
    renderLink()
    await routesReady()
    await user.click(payButton())
    expect(await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // Said once, politely: the panel took the routes' place.
    expect(mocks.announce).toHaveBeenLastCalledWith(
      'یک پرداخت نیمه\u{200C}تمام برای این سفارش دارید.',
    )
  })

  it('an attempt that ended meanwhile: the order is read again (the routes come back)', async () => {
    const user = userEvent.setup()
    const read = vi.fn<Route>(async () => ok(payLink()))
    serve(mocks.bffFetch, {
      [`payment/${PAYMENT_UUID}/cancel/`]: () =>
        Promise.reject(new ApiError({ status: 400, code: 'payment_target_invalid' })),
      [LINK_READ]: read,
    })
    renderLink({ link: payLink({ open_attempt: cardAttempt() }) })
    const panel = await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    expect(await screen.findByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })).toBeVisible()
    expect(read).toHaveBeenCalledTimes(1)
  })
})
