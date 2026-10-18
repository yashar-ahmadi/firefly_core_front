import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import type { CardTransferInstruction, PaymentStatusInfo } from '@/lib/api/types/payment'
import {
  CHECKOUT_BUDGET_KB,
  enforce,
  measure,
  measurePhone,
  measuresBudget,
  type BudgetRoute,
} from '../support/js-budget'
import { watchErrors } from '../support/watch-errors'

// The card-transfer page (Plan 4 Task 6; order digest §5.7) with the API's answers mocked in the
// browser (`page.route` on the BFF's status, cards and receipt calls): no backend write, the uuid
// below is no real payment's. In a real browser: the cards and their copy buttons, a picture
// really decoded (too small → said; the fixture → taken), the receipt sent once as multipart and
// the review state after it. The JS budget of each state (cards loading, the form, under review,
// rejected): desktop only. The live journey is checkout/card-transfer.spec.ts.

const UUID = '0e2e0e2e-7777-4222-8333-444455556666'
const PATH = `/payment/card-transfer/${UUID}/`
const SHOWN = '/payment/card-transfer/<uuid>/'
const FIXTURES = join(process.cwd(), 'tests/fixtures')
const PNG = readFileSync(join(FIXTURES, 'receipt.png'))
/** 120 × 120: a real PNG, too small for a receipt. */
const SMALL = readFileSync(join(FIXTURES, 'receipt-small.png'))
const cards = JSON.parse(readFileSync(join(FIXTURES, 'card-transfer-instruction.json'), 'utf8'))
  .data as CardTransferInstruction

const info = (changes: Partial<PaymentStatusInfo> = {}): PaymentStatusInfo => ({
  uuid: UUID,
  applies_to: 'online_charge',
  method: 'card_transfer',
  status: 'pending',
  amount: 1_049_000,
  order_code: '1411635340',
  failure_reason: '',
  settled_at: null,
  ...changes,
})

const envelope = (data: unknown, code = 200) => ({ msg: 'درخواست با موفقیت انجام شد.', code, data })

/** Calls a mock leaves unanswered (the cards loading), per page, until `abortHeld`. */
const HELD = new WeakMap<Page, Route[]>()

/** The handler stays pending (the call paused) until `abortHeld` aborts it. */
function hold(page: Page, route: Route): Promise<void> {
  HELD.set(page, [...(HELD.get(page) ?? []), route])
  return new Promise<void>((resolve) => void route.request().response().finally(resolve))
}

/**
 * Never passed on to the API: aborted once measured. A paused request is let through when its
 * context closes (measured: one 404 a run, from the phone's measure, before this).
 */
async function abortHeld(page: Page): Promise<void> {
  for (const route of HELD.get(page) ?? []) await route.abort().catch(() => undefined)
  HELD.delete(page)
}

/** The status answers `answer` (then `after` once the receipt is sent); the cards as given. */
async function mockApi(
  page: Page,
  { answer = info(), instruction = cards as CardTransferInstruction | null } = {},
) {
  const sent = { receipts: [] as string[] }
  let status = answer
  await page.route(/\/api\/bff\/payment\/[0-9a-f-]{36}\/status\/(?:\?.*)?$/, (route) =>
    route.fulfill({ json: envelope(status) }),
  )
  await page.route(/\/api\/bff\/payment\/[0-9a-f-]{36}\/card-transfer\/$/, (route) =>
    instruction ? route.fulfill({ json: envelope(instruction) }) : hold(page, route),
  )
  await page.route(/\/api\/bff\/payment\/[0-9a-f-]{36}\/card-transfer\/receipt\/$/, (route) => {
    sent.receipts.push(route.request().postDataBuffer()?.toString('latin1') ?? '')
    status = info({ status: 'awaiting_review' })
    return route.fulfill({
      status: 201,
      json: envelope(
        {
          uuid: '7c2e0f5a-1b3d-4e6f-8a9b-0c1d2e3f4a5b',
          status: 'awaiting_review',
          paid_at: '2026-10-18T09:30:00+03:30',
          image_thumbnail: null,
          rejection_reason_code: null,
          rejection_reason: '',
          reviewed_at: null,
        },
        201,
      ),
    })
  })
  return sent
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const imageInput = (page: Page) => page.getByLabel(/تصویر رسید/)

test.describe('the card-transfer page (mocked API)', () => {
  test('the cards with their copy buttons; no referrer, no operator code', async ({ page }) => {
    const errors = watchErrors(page)
    await mockApi(page)
    const response = await page.goto(PATH)
    expect(response?.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page).toHaveTitle(/پرداخت کارت به کارت/)
    await expect(page.getByRole('article', { name: 'بانک ملت' })).toBeVisible()
    await expect(page.getByText('۶۱۰۴ ۳۳۷۸ ۱۲۳۴ ۵۶۷۸')).toBeVisible()
    for (const name of ['کپی شماره کارت بانک ملت', 'کپی شماره شبای بانک سامان']) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }
    await expect(page.getByText('مهلت پرداخت سفارش:')).toBeVisible()
    expect(await page.evaluate(() => 'dataLayer' in window), 'no <head> snippet').toBe(false)
    expect(await page.locator('[data-snippet-zone]').count()).toBe(0)
    expect(errors).toEqual([])
  })

  test('a picture really decoded: too small is said; the receipt sent once; then under review', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const sent = await mockApi(page)
    await page.goto(PATH)
    // 120 × 120: decoded by the browser, refused before anything is sent.
    await imageInput(page).setInputFiles({
      name: 'small.png',
      mimeType: 'image/png',
      buffer: SMALL,
    })
    await expect(page.getByText(/دست‌کم ۳۰۰ پیکسل باشد/)).toBeVisible()
    await imageInput(page).setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
    await expect(page.getByRole('img', { name: 'پیش‌نمایش تصویر رسید انتخاب‌شده' })).toBeVisible()
    await expect(page.getByText(/دست‌کم ۳۰۰ پیکسل باشد/)).toHaveCount(0)
    await page.getByLabel(/نام صاحب کارت مبدأ/).fill('آزمون خودکار')
    await page.getByLabel(/چهار رقم آخر کارت مبدأ/).fill('۱۲۳۴')
    await page.getByRole('radio', { name: /بانک سامان/ }).check()
    await page.getByRole('button', { name: 'ثبت رسید' }).dblclick()
    await expect(heading(page)).toHaveText('رسید ثبت شد و در صف بررسی است')
    expect(sent.receipts).toHaveLength(1)
    const body = sent.receipts[0]!
    expect(body).toMatch(/name="payer_card_last_digits"\r\n\r\n1234\r\n/)
    expect(body).toMatch(/name="destination_card"\r\n\r\n10002\r\n/)
    expect(body).toMatch(/name="paid_at"\r\n\r\n\d{4}-\d\d-\d\dT\d\d:\d\d:00\+03:30\r\n/)
    expect(body).toContain('filename="receipt.png"')
    await expect(page.getByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()
    expect(errors).toEqual([])
  })
})

test('the card-transfer page’s JavaScript, in every state', async ({ page, browser }, info_) => {
  test.skip(!measuresBudget(info_.project), 'measures both viewports itself')
  test.slow()
  const state = (
    name: string,
    answer: PaymentStatusInfo,
    ready: (measured: Page) => Promise<void>,
    instruction: CardTransferInstruction | null = cards,
  ) =>
    ({
      name: `card transfer (${name})`,
      path: PATH,
      shownPath: SHOWN,
      budget: CHECKOUT_BUDGET_KB,
      prepare: async (measured) => void (await mockApi(measured, { answer, instruction })),
      cleanup: abortHeld,
      ready,
    }) satisfies BudgetRoute
  const states = [
    state(
      'cards loading',
      info(),
      (p) => expect(p.getByRole('status').first()).toBeVisible(),
      null,
    ),
    state('form', info(), (p) => expect(p.getByRole('button', { name: 'ثبت رسید' })).toBeVisible()),
    state('under review', info({ status: 'awaiting_review' }), (p) =>
      expect(heading(p)).toHaveText('رسید ثبت شد و در صف بررسی است'),
    ),
    state('rejected', info({ status: 'failed', failure_reason: 'payment_receipt_rejected' }), (p) =>
      expect(heading(p)).toHaveText('رسید پذیرفته نشد'),
    ),
  ]
  const figures = []
  for (const route of states) {
    figures.push(await measure(page, route, 'desktop'), await measurePhone(browser, route))
  }
  enforce(info_, ...figures)
})
