import { expect, test, type Response } from '@playwright/test'
import type { CardTransferInstruction } from '@/lib/api/types/payment'
import { cancelGuestOrder, placeGuestOrder, type GuestOrderHandle } from '../support/guest-order'
import { CHECKOUT_BUDGET_KB, enforce, measure, type BudgetRoute } from '../support/js-budget'
import { watchErrors } from '../support/watch-errors'

// The card-to-card journey (Plan 4 Task 6; order digest §5.7), in the `journeys` project (ruling
// P4-R4: a guest, one at a time): a guest order (placed through the BFF), its link page, «کارت به
// کارت» → a LIVE intent and a full page load to the card-transfer page, whose cards come from the
// LIVE `GET payment/<uuid>/card-transfer/` (never the intent's answer); the page holds the
// credential (no referrer, no operator code); the cards, their copy buttons, the attempt's own
// cut-off (read from the link page: this device kept the token). The receipt is filled in with the
// fixture PNG and its POST is MOCKED (`page.route`): a live upload would move the order to
// awaiting_review, which cannot be cancelled (Task 10 owns the one live upload). Then the review
// state, and the cleanup: the attempt cancelled and the order cancelled through its link
// (guarded: whatever happened, in `finally`).
// Per run: 1 placement; `payment_attempt` 2 (the intent, the attempt's cancel; of 30/h);
// `payment_status` 4 live (the page's status and cards reads, twice: on arrival and for the
// budget's measure; the review's status is mocked; of 240/h); `order_payment_link` 4 (the link
// page, the cut-off's read twice, the cancel; of 30/min). Never printed: the token or the uuid.

const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/link\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)
const isCards = (response: Response) =>
  /\/api\/bff\/payment\/[0-9a-f-]{36}\/card-transfer\/$/.test(new URL(response.url()).pathname)

test('a guest pays card to card: live cards, the receipt sent (mocked), then cancelled', async ({
  page,
  context,
}, info) => {
  test.slow()
  const errors = watchErrors(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  let order: GuestOrderHandle | null = null
  let attempt: string | null = null
  let cancelled = false
  try {
    order = await placeGuestOrder(page)
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
    attempt = /\/payment\/card-transfer\/([0-9a-f-]{36})\/$/.exec(
      new URL((await document).url()).pathname,
    )![1]!
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

    const form: BudgetRoute = {
      name: 'card transfer (form, live)',
      path: `/payment/card-transfer/${attempt}/`,
      shownPath: '/payment/card-transfer/<uuid>/',
      budget: CHECKOUT_BUDGET_KB,
      ready: (measured) => expect(measured.getByRole('button', { name: 'ثبت رسید' })).toBeVisible(),
    }

    // The receipt, its POST mocked (and the status after it): nothing reaches the review queue.
    const posted: string[] = []
    await page.route(/\/api\/bff\/payment\/[0-9a-f-]{36}\/card-transfer\/receipt\/$/, (route) => {
      posted.push(route.request().postDataBuffer()?.toString('latin1') ?? '')
      return route.fulfill({
        status: 201,
        json: {
          msg: 'ایجاد شد',
          code: 201,
          data: {
            uuid: '7c2e0f5a-1b3d-4e6f-8a9b-0c1d2e3f4a5b',
            status: 'awaiting_review',
            paid_at: new Date().toISOString(),
            image_thumbnail: null,
            rejection_reason_code: null,
            rejection_reason: '',
            reviewed_at: null,
          },
        },
      })
    })
    await page.route(/\/api\/bff\/payment\/[0-9a-f-]{36}\/status\/(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          msg: 'درخواست با موفقیت انجام شد.',
          code: 200,
          data: {
            uuid: attempt,
            applies_to: 'online_charge',
            method: 'card_transfer',
            status: 'awaiting_review',
            amount: instruction.amount,
            order_code: order!.orderCode,
            failure_reason: '',
            settled_at: null,
          },
        },
      }),
    )
    await page.getByLabel(/تصویر رسید/).setInputFiles('tests/fixtures/receipt.png')
    await expect(page.getByRole('img', { name: 'پیش‌نمایش تصویر رسید انتخاب‌شده' })).toBeVisible()
    await page.getByLabel(/نام صاحب کارت مبدأ/).fill('آزمون خودکار')
    await page.getByLabel(/چهار رقم آخر کارت مبدأ/).fill('۱۲۳۴')
    await page.getByRole('radio', { name: new RegExp(first.bank_name) }).check()
    await page.getByRole('button', { name: 'ثبت رسید' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'رسید ثبت شد و در صف بررسی است',
    )
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatch(/name="payer_card_last_digits"\r\n\r\n1234\r\n/)
    expect(posted[0]).toMatch(new RegExp(`name="destination_card"\\r\\n\\r\\n${first.id}\\r\\n`))
    await expect(page.getByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()
    await page.unrouteAll({ behavior: 'wait' })

    enforce(info, await measure(page, form, 'desktop'))
    expect(errors).toEqual([])
  } finally {
    // The attempt, then the order: nothing of this run stays open in the dev database.
    if (attempt) {
      const abandoned = await page.request
        .post(`/api/bff/payment/${attempt}/cancel/`, { headers: { 'X-Requested-With': 'ff' } })
        .catch(() => null)
      if (!abandoned?.ok())
        console.warn(`[card-transfer] attempt not cancelled: ${abandoned?.status()}`)
    }
    if (order) cancelled = await cancelGuestOrder(page, order.token)
    await page.request
      .delete('/api/bff/cart/clear/', { headers: { 'X-Requested-With': 'ff' } })
      .catch(() => undefined)
  }
  expect(cancelled, 'the order cancelled').toBe(true)
})
