import { expect, test, type Page } from '@playwright/test'
import { COPY } from '@/features/payment/result-copy'
import type { PaymentStatusInfo } from '@/lib/api/types/payment'
import {
  CHECKOUT_BUDGET_KB,
  enforce,
  measure,
  measurePhone,
  measuresBudget,
  type BudgetRoute,
} from '../support/js-budget'
import { watchErrors } from '../support/watch-errors'

// The bank's return page `/payment/callback/` (Plan 4 Task 5; order digest §4.2, §5.10–5.12), as
// a guest, with the payment's status mocked in the browser (`page.route` on the BFF's status
// read): the dev backend cannot run a bank (§11 #3), so no real return can be had. No backend
// write; the uuid below is no real payment's. The status decides what the page says (a code only
// the words), the uuid leaves the address bar at once and a reload still finds it, the page sends
// no referrer and runs no operator code. The real status of a real (cancelled) attempt is read
// once in checkout/pay-link.spec.ts, which has one. The JS budget of each state: desktop only.

const UUID = '0e2e0e2e-1111-4222-8333-444455556666'
const STATUS = /\/api\/bff\/payment\/[0-9a-f-]{36}\/status\/(?:\?.*)?$/

const info = (changes: Partial<PaymentStatusInfo> = {}): PaymentStatusInfo => ({
  uuid: UUID,
  applies_to: 'online_charge',
  method: 'bank_gateway',
  status: 'pending',
  amount: 1_049_000,
  order_code: '1411635340',
  failure_reason: '',
  settled_at: null,
  ...changes,
})

/** Answers the status reads in turn (the last one again and again); returns the read count. */
async function mockStatus(page: Page, answers: PaymentStatusInfo[]) {
  const reads = { count: 0 }
  await page.route(STATUS, (route) => {
    const data = answers[Math.min(reads.count++, answers.length - 1)]
    return route.fulfill({ json: { msg: 'درخواست با موفقیت انجام شد.', code: 200, data } })
  })
  return reads
}

const back = (query: string) => `/payment/callback/${query}`
const toman = (amount: number) => `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`
const heading = (page: Page) => page.getByRole('heading', { level: 1 })

test.describe('the payment result page', () => {
  test('settled: success; the uuid out of the address bar; no referrer, no operator code', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await mockStatus(page, [info({ status: 'settled' })])
    const response = await page.goto(back(`?result=success&payment=${UUID}`))
    expect(response?.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page).toHaveTitle(/نتیجهٔ پرداخت/)
    await expect(heading(page)).toHaveText('پرداخت موفق')
    await expect(
      page.getByText(COPY.settled.replace('{order_code}', '۱۴۱۱۶۳۵۳۴۰'), { exact: true }),
    ).toBeVisible()
    await expect(heading(page)).toBeFocused()
    expect(new URL(page.url()).search).toBe('?result=success')
    expect(await page.evaluate(() => 'dataLayer' in window), 'no <head> snippet').toBe(false)
    // A reload of what is left: the same payment, from this tab's copy.
    await page.reload()
    await expect(heading(page)).toHaveText('پرداخت موفق')
    expect(errors).toEqual([])
  })

  test('pending, then settled after two more reads (a fast clock): never success early', async ({
    page,
  }) => {
    await page.clock.install()
    const reads = await mockStatus(page, [info(), info(), info({ status: 'settled' })])
    await page.goto(back(`?result=success&payment=${UUID}`))
    await expect(heading(page)).toHaveText('در حال بررسی پرداخت')
    await expect(page.getByText(COPY.verifying, { exact: true })).toBeVisible()
    await page.clock.fastForward(15_000)
    await expect.poll(() => reads.count).toBe(2)
    await expect(heading(page)).toHaveText('در حال بررسی پرداخت')
    await page.clock.fastForward(15_000)
    await expect(heading(page)).toHaveText('پرداخت موفق')
    expect(reads.count).toBe(3)
  })

  const STATES: Array<[string, string, PaymentStatusInfo, string, string]> = [
    [
      'failed + gateway_rejected',
      '?result=failed&code=gateway_rejected',
      info({ status: 'failed', failure_reason: 'gateway_rejected' }),
      'پرداخت ناموفق',
      COPY.rejected,
    ],
    [
      'failed + gateway_capture_not_bookable',
      '?result=failed&code=gateway_capture_not_bookable',
      info({ status: 'failed', failure_reason: 'gateway_capture_not_bookable' }),
      'پرداخت ثبت نشد',
      COPY.notBookable,
    ],
    [
      'failed + gateway_unavailable',
      '?result=failed&code=gateway_unavailable',
      info({ status: 'failed', failure_reason: 'gateway_unavailable' }),
      'پرداخت ناموفق',
      COPY.unavailable,
    ],
    [
      'pending + gateway_capture_parked',
      '?result=pending&code=gateway_capture_parked',
      info(),
      'پرداخت در دست پیگیری',
      COPY.parked,
    ],
    [
      'pending + gateway_amount_mismatch',
      '?result=pending&code=gateway_amount_mismatch',
      info(),
      'پرداخت در دست پیگیری',
      COPY.parked,
    ],
    [
      'result=failed without a code, still pending',
      '?result=failed',
      info(),
      'در حال بررسی پرداخت',
      COPY.unknown,
    ],
    [
      'cancelled + payment_attempt_expired',
      '?result=pending&code=gateway_verification_pending',
      info({ status: 'cancelled', failure_reason: 'payment_attempt_expired' }),
      'بررسی پرداخت به نتیجه نرسید',
      COPY.expired,
    ],
    [
      'refunded',
      '?result=failed&code=gateway_capture_refunded',
      info({ status: 'refunded' }),
      'مبلغ بازگردانده شد',
      COPY.refunded,
    ],
    [
      'a wallet top-up settled',
      '?result=success',
      info({ status: 'settled', applies_to: 'wallet_topup', order_code: null }),
      'شارژ موفق',
      COPY.topUp,
    ],
  ]
  for (const [name, query, answer, title, body] of STATES) {
    test(`${name}: «${title}»`, async ({ page }) => {
      const errors = watchErrors(page)
      await mockStatus(page, [answer])
      await page.goto(back(`${query}&payment=${UUID}`))
      await expect(heading(page)).toHaveText(title)
      await expect(page.getByText(body, { exact: true })).toBeVisible()
      // A guest on a device that kept nothing: never a made-up door for «پرداخت دوباره».
      await expect(page.getByRole('button', { name: 'پرداخت دوباره' })).toHaveCount(0)
      if (body === COPY.parked) await expect(page.getByText(UUID)).toBeVisible()
      expect(errors).toEqual([])
    })
  }

  test('a return without a payment: invalid, with tracking; no status read', async ({ page }) => {
    const reads = await mockStatus(page, [info()])
    await page.goto(back('?result=failed&code=gateway_callback_invalid'))
    await expect(heading(page)).toHaveText(COPY.invalid)
    await expect(page.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(reads.count).toBe(0)
  })

  test('after 15 minutes: stopped, and «بررسی دوباره» reads once', async ({ page }) => {
    test.slow()
    await page.clock.install()
    // Each answer its own amount: the page showing it proves that read was handled, and so the
    // next one scheduled (the schedule waits for each answer), before the clock jumps again. A
    // jump made while an answer was still on its way fired nothing (Task 10, run 1, tablet).
    const amountOf = (read: number) => 1_000_000 + read
    const reads = await mockStatus(
      page,
      Array.from({ length: 30 }, (_, read) => info({ amount: amountOf(read) })),
    )
    const shown = (read: number) => page.getByText(toman(amountOf(read)), { exact: true })
    await page.goto(back(`?result=success&payment=${UUID}`))
    await expect(heading(page)).toHaveText('در حال بررسی پرداخت')
    await expect(shown(0)).toBeVisible()
    const stopped = page.getByText(COPY.stopped, { exact: true })
    for (let minute = 0; minute < 20 && !(await stopped.isVisible()); minute++) {
      const done = reads.count
      await page.clock.fastForward('01:00')
      // The read due in that minute, answered and shown (or the window over: stopped).
      await expect(shown(done).or(stopped).first()).toBeVisible()
    }
    await expect(stopped).toBeVisible()
    const count = reads.count
    await page.getByRole('button', { name: 'بررسی دوباره' }).click()
    await expect.poll(() => reads.count).toBe(count + 1)
    await page.clock.fastForward('10:00')
    await page.waitForTimeout(500)
    expect(reads.count, 'no new schedule').toBe(count + 1)
  })
})

test('the payment result page’s JavaScript, in every state', async ({ page, browser }, info_) => {
  test.skip(!measuresBudget(info_.project), 'measures both viewports itself')
  test.slow()
  const state = (name: string, query: string, answer: PaymentStatusInfo | null, title: string) =>
    ({
      name: `payment result (${name})`,
      path: back(query),
      shownPath: back(query.replace(UUID, '<uuid>')),
      budget: CHECKOUT_BUDGET_KB,
      prepare: async (measured) => void (answer && (await mockStatus(measured, [answer]))),
      ready: (measured) => expect(heading(measured)).toHaveText(title),
    }) satisfies BudgetRoute
  const states = [
    state('pending', `?result=success&payment=${UUID}`, info(), 'در حال بررسی پرداخت'),
    state('success', `?result=success&payment=${UUID}`, info({ status: 'settled' }), 'پرداخت موفق'),
    state(
      'failed',
      `?result=failed&payment=${UUID}&code=gateway_rejected`,
      info({ status: 'failed', failure_reason: 'gateway_rejected' }),
      'پرداخت ناموفق',
    ),
    state('invalid', '?result=failed&code=gateway_callback_invalid', null, COPY.invalid),
  ]
  const figures = []
  for (const route of states) {
    figures.push(await measure(page, route, 'desktop'), await measurePhone(browser, route))
  }
  enforce(info_, ...figures)
})
