import { expect, type Response } from '@playwright/test'
import type { CardTransferInstruction, PaymentStatusInfo } from '@/lib/api/types/payment'
import { placeGuestOrder } from '../support/guest-order'
import { CHECKOUT_BUDGET_KB, enforce, measure, type BudgetRoute } from '../support/js-budget'
import { orderGuardTest as test } from '../support/order-guard'
import { bodyOf, mockReceipt, RECEIPT } from '../support/receipt-mock'
import { watchErrors } from '../support/watch-errors'

// The card-to-card journey (Plan 4 Tasks 6 and 10; order digest §5.7), in the `journeys` project
// (ruling P4-R4: a guest, one at a time): a guest order (placed through the BFF), its link page,
// «کارت به کارت» → a LIVE intent and a full page load to the card-transfer page, whose cards come
// from the LIVE `GET payment/<uuid>/card-transfer/` (never the intent's answer); the page holds
// the credential (no referrer, no operator code); the cards, their copy buttons, the attempt's
// own cut-off (read from the link page: this device kept the token). The receipt: a 400×400 PNG
// fixture, its POST MOCKED (support/receipt-mock.ts: a live upload moves the order to
// awaiting_review, which no customer can cancel), then the review state. The cleanup is the
// `orders` guard's (support/order-guard.ts, however the test ends): the attempt cancelled, then
// the order through its link.
// Opt-in, once (Task 10): `E2E_LIVE_RECEIPT=1` sends the receipt LIVE (`payment_receipt_upload`:
// 10 an hour): «در صف بررسی» from the server's own answers; once the receipt is taken the order
// is left under review for the shop's operator to reject (its code is printed; the guard leaves
// it; before that the guard cancels it as usual), and the budget is not measured (the page is
// past its form).
// Per routine run: 1 placement; `payment_attempt` 2 (the intent, the attempt's cancel; of 30/h);
// `payment_status` 4 live (the page's status and cards reads, twice: on arrival and for the
// budget's measure; of 240/h); `order_payment_link` 4 (the link page, the cut-off's read twice,
// the cancel; of 30/min). Live: 1 placement, 1 intent, 1 receipt upload, no cancel. Never
// printed: the token or the uuid.

const LIVE = process.env.E2E_LIVE_RECEIPT === '1'
const RECEIPT_PNG = 'tests/fixtures/receipt-400.png'

const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/link\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)
const isCards = (response: Response) =>
  /\/api\/bff\/payment\/[0-9a-f-]{36}\/card-transfer\/$/.test(new URL(response.url()).pathname)

test(`a guest pays card to card: live cards, a 400×400 receipt sent (${LIVE ? 'LIVE, left under review' : 'mocked'})`, async ({
  page,
  context,
  orders,
}, info) => {
  test.slow()
  const errors = watchErrors(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const order = await placeGuestOrder(page)
  orders.track({ code: order.orderCode, token: order.token })
  await page.goto(`/order/pay/${order.token}/`)
  const routes = page.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
  await routes.getByRole('radio', { name: /کارت به کارت/ }).check()

  // The live intent, then a full load to the page (its document answers no-referrer).
  const intent = page.waitForResponse(isIntent)
  const live = page.waitForResponse(isCards)
  const document = page.waitForResponse(
    (response) =>
      response.request().isNavigationRequest() &&
      /\/payment\/card-transfer\/[0-9a-f-]{36}\/$/.test(new URL(response.url()).pathname),
  )
  await page.getByRole('button', { name: 'پرداخت سفارش' }).click()
  expect((await intent).status(), 'a card-transfer attempt').toBe(201)
  const attempt = /\/payment\/card-transfer\/([0-9a-f-]{36})\/$/.exec(
    new URL((await document).url()).pathname,
  )![1]!
  // Cancelled at the end in a routine run; in a LIVE one the order's cancel closes it unless its
  // receipt is taken (then the order is left under review on purpose, below).
  if (!LIVE) orders.attempt(attempt)
  expect((await document).headers()['referrer-policy']).toBe('no-referrer')
  const read = await live
  expect(read.status(), 'the cards, read live').toBe(200)
  const instruction = ((await read.json()) as { data: CardTransferInstruction }).data
  expect(instruction.destination_cards.length).toBeGreaterThan(0)

  await expect(page.getByRole('heading', { level: 1, name: 'پرداخت کارت به کارت' })).toBeVisible()
  await expect(page).toHaveTitle(/پرداخت کارت به کارت/)
  expect(await page.evaluate(() => 'dataLayer' in window), 'no <head> snippet').toBe(false)
  for (const card of instruction.destination_cards) {
    await expect(page.getByRole('article', { name: card.bank_name })).toBeVisible()
  }
  const first = instruction.destination_cards[0]!
  await page.getByRole('button', { name: `کپی شماره کارت ${first.bank_name}` }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    first.card_number.replace(/\D/g, ''),
  )
  // The attempt's own cut-off: the link page read with the token this device kept.
  await expect(page.getByText('مهلت واریز و ثبت رسید:')).toBeVisible()

  // The receipt: mocked (routine), or LIVE once (its POST and the status after it the server's).
  const posted: string[] = LIVE
    ? []
    : await mockReceipt(page, {
        attempt,
        amount: instruction.amount,
        orderCode: order.orderCode,
      })
  if (LIVE) {
    // Read on its way through a route that sends it on unchanged: a multipart body holding a
    // file is visible only to an intercepted request (a `request` listener gets none; the one
    // live run of Task 10 failed there after the server had taken the receipt).
    await page.route(RECEIPT, (route) => {
      posted.push(bodyOf(route.request()))
      return route.continue()
    })
  }
  await page.getByLabel(/تصویر رسید/).setInputFiles(RECEIPT_PNG)
  await expect(page.getByRole('img', { name: 'پیش‌نمایش تصویر رسید انتخاب‌شده' })).toBeVisible()
  await page.getByLabel(/نام صاحب کارت مبدأ/).fill('آزمون خودکار')
  await page.getByLabel(/چهار رقم آخر کارت مبدأ/).fill('۱۲۳۴')
  await page.getByRole('radio', { name: new RegExp(first.bank_name) }).check()
  const uploaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && RECEIPT.test(new URL(response.url()).pathname),
  )
  await page.getByRole('button', { name: 'ثبت رسید' }).click()
  expect((await uploaded).status(), 'the receipt taken').toBe(201)
  if (LIVE)
    orders.keep(order.orderCode, 'its receipt is LIVE under review: the operator rejects it')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('رسید ثبت شد و در صف بررسی است')
  expect(posted).toHaveLength(1)
  expect(posted[0]).toMatch(/name="payer_card_last_digits"\r\n\r\n1234\r\n/)
  expect(posted[0]).toMatch(new RegExp(`name="destination_card"\\r\\n\\r\\n${first.id}\\r\\n`))
  await expect(page.getByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()

  if (LIVE) {
    // The server's own word: the attempt is under review (one status read through the BFF).
    const status = await page.request.get(`/api/bff/payment/${attempt}/status/`, {
      headers: { 'X-Requested-With': 'ff' },
    })
    const answer = ((await status.json()) as { data: PaymentStatusInfo }).data
    expect(answer.status, 'the attempt under review, live').toBe('awaiting_review')
    console.log(`[card-transfer] LIVE receipt sent: order ${order.orderCode} left under review`)
  } else {
    await page.unrouteAll({ behavior: 'wait' })
    const form: BudgetRoute = {
      name: 'card transfer (form, live)',
      path: `/payment/card-transfer/${attempt}/`,
      shownPath: '/payment/card-transfer/<uuid>/',
      budget: CHECKOUT_BUDGET_KB,
      ready: (measured) => expect(measured.getByRole('button', { name: 'ثبت رسید' })).toBeVisible(),
    }
    enforce(info, await measure(page, form, 'desktop'))
  }
  expect(errors).toEqual([])
})
