import { expect, test, type Page, type Response } from '@playwright/test'
import { toPersianDigits } from '@/lib/format/digits'
import { cancelGuestOrder, placeGuestOrder, type GuestOrderHandle } from '../support/guest-order'
import {
  CHECKOUT_BUDGET_KB,
  enforce,
  measure,
  measurePhone,
  type BudgetRoute,
} from '../support/js-budget'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// The payment link from the SMS (Plan 4 Task 4), in the `journeys` project (ruling P4-R4: a
// guest, one at a time): a guest order left awaiting payment (placed through the BFF, no intent),
// opened as the SMS spells it, WITHOUT the trailing slash (308 to the page, the token kept, no
// referrer). The page shows the order and its routes. The dev backend cannot run a bank (digest
// §11 #3): a named gateway answers 400 `gateway_unknown` (withdrawn, the other one tried with a
// press), an unnamed one 503 `gateway_not_configured`; either way the page says the bank cannot
// be used here, with support, and never navigates. Card to card opens an attempt (its page is
// Task 6's, a 404 until then); back on the link the attempt's resume UI shows instead of the
// routes, and its «انصراف» cancels it. The order is then cancelled through the page's dialog
// (this is the cleanup; a guard cancels it through the API if the test ends earlier). The JS
// budget of the link's pages is measured on the way: payable, with an open attempt, refused.
// Per run: 1 placement; 2-3 `payment_attempt` calls for the bank and the card, 1 attempt cancel
// (of 30/h); about 9 `order_payment_link` reads and the cancel (of 30/min). Never printed: the
// token (`<token>` in the budget lines).

const SHOWN = '/order/pay/<token>/'
const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/link\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)

const routes = (page: Page) => page.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
const attemptPanel = (page: Page) => page.getByRole('region', { name: 'پرداخت باز این سفارش' })
/** The routes section's own alert (not Next's route announcer, also an alert). */
const payAlert = (page: Page) => page.getByRole('region', { name: 'روش پرداخت' }).getByRole('alert')

test('a guest opens the SMS link: the routes, the bank refused, a card attempt resumed, the order cancelled', async ({
  page,
  browser,
}, info) => {
  test.slow()
  const errors = watchErrors(page)
  let order: GuestOrderHandle | null = null
  let cancelled = false
  const figures = []
  try {
    order = await placeGuestOrder(page)
    const path = `/order/pay/${order.token}/`

    // The SMS link: no trailing slash. A 308 to the page, the token kept, no referrer.
    const sms = await page.request.get(`/order/pay/${order.token}`, { maxRedirects: 0 })
    expect(sms.status(), 'the SMS link is sent on').toBe(308)
    expect(new URL(sms.headers()['location']!, 'http://shop.invalid').pathname).toBe(path)
    const opened = await page.goto(`/order/pay/${order.token}`)
    expect(new URL(page.url()).pathname, 'the page, its token kept').toBe(path)
    expect(opened?.status()).toBe(200)
    expect(opened?.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page).toHaveTitle(new RegExp(`پرداخت سفارش ${toPersianDigits(order.orderCode)}`))
    await expect(page.getByRole('heading', { level: 1, name: 'پرداخت سفارش' })).toBeVisible()
    await expect(page.getByText(toPersianDigits(order.orderCode)).first()).toBeVisible()
    await expect(routes(page).getByRole('radio', { name: /درگاه بانکی/ })).toBeChecked()
    await expect(routes(page).getByRole('radio', { name: /کارت به کارت/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'ورود برای استفاده از کیف پول' })).toBeVisible()

    const payable: BudgetRoute = {
      name: 'pay-link',
      path,
      shownPath: SHOWN,
      budget: CHECKOUT_BUDGET_KB,
      ready: (measured) => expect(routes(measured)).toBeVisible(),
    }
    figures.push(await measure(page, payable, 'desktop'), await measurePhone(browser, payable))

    // The bank: refused by the dev backend; no navigation, the bank closed with support.
    const press = () => page.getByRole('button', { name: 'پرداخت سفارش' }).click()
    const first = page.waitForResponse(isIntent)
    await press()
    const bank = await first
    forgiveFailure(page, bank.url(), bank.status())
    if (bank.status() === 400) {
      await expect(payAlert(page)).toContainText('این درگاه در حال حاضر در دسترس نیست')
      const second = page.waitForResponse(isIntent)
      await press()
      const again = await second
      forgiveFailure(page, again.url(), again.status())
      expect(again.status()).toBe(400)
    } else {
      expect(bank.status()).toBe(503)
    }
    const alert = payAlert(page)
    await expect(alert).toContainText('پرداخت با درگاه بانکی در این فروشگاه اکنون ممکن نیست')
    await expect(alert.getByRole('link', { name: /پشتیبانی/ })).toBeVisible()
    expect(new URL(page.url()).pathname, 'never sent anywhere').toBe(path)

    // Card to card: an attempt opens; its page is a full page load (Task 6's, 404 until then).
    await routes(page)
      .getByRole('radio', { name: /کارت به کارت/ })
      .check()
    const card = page.waitForResponse(isIntent)
    await press()
    expect((await card).status(), 'a card transfer attempt').toBe(201)
    await page.waitForURL(/\/payment\/card-transfer\/[0-9a-f-]{36}\/$/)

    // Back on the link: the attempt's resume UI instead of the routes.
    await page.goto(path)
    await expect(attemptPanel(page)).toContainText('پرداخت کارت به کارت شما باز است')
    await expect(routes(page)).toHaveCount(0)
    const withAttempt: BudgetRoute = {
      ...payable,
      name: 'pay-link (open attempt)',
      ready: (measured) => expect(attemptPanel(measured)).toBeVisible(),
    }
    figures.push(
      await measure(page, withAttempt, 'desktop'),
      await measurePhone(browser, withAttempt),
    )
    const abandoned = page.waitForResponse(/\/api\/bff\/payment\/[0-9a-f-]{36}\/cancel\/$/)
    await attemptPanel(page).getByRole('button', { name: 'انصراف' }).click()
    expect((await abandoned).status(), 'the attempt abandoned').toBe(200)
    await expect(routes(page)).toBeVisible()

    // The order cancelled through the page's dialog (the safe choice focused first).
    await page.getByRole('button', { name: 'لغو سفارش' }).click()
    const dialog = page.getByRole('dialog', { name: 'لغو سفارش' })
    await expect(dialog.getByRole('button', { name: 'بازگشت' })).toBeFocused()
    await dialog.getByLabel(/دلیل لغو/).fill('آزمون خودکار')
    const cancel = page.waitForResponse(/\/api\/bff\/order\/pay\/[^/]+\/cancel\/$/)
    await dialog.getByRole('button', { name: 'لغو سفارش' }).click()
    expect((await cancel).status(), 'the order cancelled').toBe(200)
    cancelled = true
    await expect(page.getByRole('heading', { name: 'سفارش لغو شد' })).toBeFocused()

    // Its link is revoked now: the calm 404 page, measured too.
    const gone: BudgetRoute = {
      ...payable,
      name: 'pay-link (refused)',
      status: 404,
      ready: (measured) =>
        expect(measured.getByRole('heading', { name: 'لینک معتبر نیست' })).toBeVisible(),
    }
    forgiveFailure(page, new URL(path, page.url()).href, 404)
    figures.push(await measure(page, gone, 'desktop'), await measurePhone(browser, gone))
    enforce(info, ...figures)
    expect(errors).toEqual([])
  } finally {
    if (order && !cancelled) await cancelGuestOrder(page, order.token)
    await page.request
      .delete('/api/bff/cart/clear/', { headers: { 'X-Requested-With': 'ff' } })
      .catch(() => undefined)
  }
})
