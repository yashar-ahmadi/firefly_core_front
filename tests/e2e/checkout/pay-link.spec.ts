import { expect, type Page, type Response } from '@playwright/test'
import { toPersianDigits } from '@/lib/format/digits'
import { waitForCredentialPath } from '../support/credential-url'
import { placeGuestOrder } from '../support/guest-order'
import {
  CHECKOUT_BUDGET_KB,
  enforce,
  measure,
  measurePhone,
  type BudgetRoute,
} from '../support/js-budget'
import { orderGuardTest as test } from '../support/order-guard'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// The payment link from the SMS (Plan 4 Task 4), in the `journeys` project (ruling P4-R4: a
// guest, one at a time): a guest order left awaiting payment (placed through the BFF, no intent),
// opened as the SMS spells it, WITHOUT the trailing slash (308 to the page, the token kept, no
// referrer, no operator snippet). The page shows the order and its routes. The dev backend cannot
// run a bank (digest §11 #3) and says so up front since its 2026-11-05 round: its gateway list
// names only usable gateways (none, BACKEND-ISSUES M-4) and its method list closes the bank route
// with its reason, so the bank is offered disabled with that reason, card to card is chosen, and
// no bank intent is ever sent. Card to card opens an attempt
// (a full load to its page, card-transfer.spec.ts's subject); back on the link the attempt's resume UI shows
// instead of the routes, and its «انصراف» cancels it; the bank's return page then reads that
// cancelled attempt's real status (Task 5). The order is then cancelled through the
// page's dialog (this is the cleanup; the `orders` guard, support/order-guard.ts, cancels it
// through the API if the test ends earlier, a timeout included). The JS budget of the link's pages is measured on the way: payable, with an open
// attempt, refused.
// Per run: 1 placement; 1 `payment_attempt` call for the card, 1 attempt cancel (of 30/h); about
// 11 `order_payment_link` reads and the cancel (of 30/min); 3 `payment_status`
// reads (the card page's status and cards, the result page; of 240/h). Never printed: the token
// (`<token>` in the budget lines).

const SHOWN = '/order/pay/<token>/'
const CARD_PAGE = /^\/payment\/card-transfer\/([0-9a-f-]{36})\/$/
/** The sample data's end-of-body snippet (snippets.spec.ts). */
const SEAL_LOG = 'enamad placeholder'
const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/link\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)

const routes = (page: Page) => page.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
const attemptPanel = (page: Page) => page.getByRole('region', { name: 'پرداخت باز این سفارش' })

test('a guest opens the SMS link: the routes, the bank closed, a card attempt resumed, the order cancelled', async ({
  page,
  browser,
  orders,
}, info) => {
  test.slow()
  const errors = watchErrors(page)
  const figures = []
  const order = await placeGuestOrder(page)
  orders.track({ code: order.orderCode, token: order.token })
  const path = `/order/pay/${order.token}/`

  // The SMS link: no trailing slash. A 308 to the page, the token kept, no referrer.
  const sms = await page.request.get(`/order/pay/${order.token}`, { maxRedirects: 0 })
  expect(sms.status(), 'the SMS link is sent on').toBe(308)
  // Compared, never printed (the token is a credential): every check of an address here.
  const sent = new URL(sms.headers()['location']!, 'http://shop.invalid').pathname
  expect(sent === path, 'the SMS link leads to the page, its token kept').toBe(true)
  const logs: string[] = []
  page.on('console', (message) => logs.push(message.text()))
  const opened = await page.goto(`/order/pay/${order.token}`)
  expect(new URL(page.url()).pathname === path, 'the page, its token kept').toBe(true)
  expect(opened?.status()).toBe(200)
  expect(opened?.headers()['referrer-policy']).toBe('no-referrer')
  // A real link's page runs none of the operator's snippets (snippets.spec.ts: they run on the
  // shop's other pages): no <head> analytics, no end-of-body seal, no snippet zone at all.
  await page.waitForLoadState('load')
  expect(await page.evaluate(() => 'dataLayer' in window), 'no <head> snippet').toBe(false)
  expect(logs, 'no end-of-body snippet').not.toContain(SEAL_LOG)
  expect(await page.locator('[data-snippet-zone]').count(), 'no snippet zone').toBe(0)
  await expect(page).toHaveTitle(new RegExp(`پرداخت سفارش ${toPersianDigits(order.orderCode)}`))
  await expect(page.getByRole('heading', { level: 1, name: 'پرداخت سفارش' })).toBeVisible()
  await expect(page.getByText(toPersianDigits(order.orderCode)).first()).toBeVisible()
  // No usable gateway: the bank offered disabled with the method list's reason; card to card,
  // the first enabled route after it, chosen.
  await expect(routes(page).getByRole('radio', { name: /درگاه بانکی/ })).toBeDisabled()
  await expect(routes(page)).toContainText('درگاه پرداخت پیکربندی نشده است.')
  await expect(routes(page).getByRole('radio', { name: /کارت به کارت/ })).toBeChecked()
  await expect(page.getByRole('link', { name: 'ورود برای استفاده از کیف پول' })).toBeVisible()

  const payable: BudgetRoute = {
    name: 'pay-link',
    path,
    shownPath: SHOWN,
    budget: CHECKOUT_BUDGET_KB,
    ready: (measured) => expect(routes(measured)).toBeVisible(),
  }
  figures.push(await measure(page, payable, 'desktop'), await measurePhone(browser, payable))

  const press = () => page.getByRole('button', { name: 'پرداخت سفارش' }).click()
  const intents: Response[] = []
  page.on('response', (response) => {
    if (isIntent(response)) intents.push(response)
  })

  // Card to card: an attempt opens; its page is a full page load (card-transfer.spec.ts).
  await routes(page)
    .getByRole('radio', { name: /کارت به کارت/ })
    .check()
  const card = page.waitForResponse(isIntent)
  await press()
  expect((await card).status(), 'a card transfer attempt').toBe(201)
  // The only intent of the run: never one for the closed bank.
  expect(intents.map((response) => response.request().postDataJSON())).toEqual([
    { route: 'card_transfer' },
  ])
  await waitForCredentialPath(page, CARD_PAGE, 'the card-transfer page')
  const attempt = CARD_PAGE.exec(new URL(page.url()).pathname)![1]!

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

  // The bank's return page with this real, cancelled attempt (Plan 4 Task 10's check, one
  // status read): its status says what it came to, whatever the return claims; the uuid
  // leaves the address bar.
  await page.goto(`/payment/callback/?result=failed&payment=${attempt}`)
  await expect(page.getByRole('heading', { level: 1, name: 'پرداخت بسته شد' })).toBeVisible()
  await expect(page.getByText('این تلاش پرداخت بسته شده است.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'پرداخت دوباره' })).toHaveCount(0)
  expect(page.url().includes(attempt), 'the uuid out of the address bar').toBe(false)
  await page.goto(path)
  await expect(routes(page)).toBeVisible()

  // The order cancelled through the page's dialog (the safe choice focused first).
  await page.getByRole('button', { name: 'لغو سفارش' }).click()
  const dialog = page.getByRole('dialog', { name: 'لغو سفارش' })
  await expect(dialog.getByRole('button', { name: 'بازگشت' })).toBeFocused()
  await dialog.getByLabel(/دلیل لغو/).fill('آزمون خودکار')
  const cancel = page.waitForResponse(/\/api\/bff\/order\/pay\/[^/]+\/cancel\/$/)
  await dialog.getByRole('button', { name: 'لغو سفارش' }).click()
  expect((await cancel).status(), 'the order cancelled').toBe(200)
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
})
