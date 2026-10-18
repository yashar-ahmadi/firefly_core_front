import { expect, test, type Page } from '@playwright/test'
import {
  CHECKOUT_BUDGET_KB,
  enforce,
  measure,
  measurePhone,
  measuresBudget,
  type BudgetRoute,
} from '../support/js-budget'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// Guest order tracking `/order/track/` (Plan 4 Task 7; order digest §3.1.8), as a guest, in every
// device project. Two real lookups per project (a known order, a wrong pair): `order_tracking`
// allows 20 a minute per address, and the three projects share one (6 a run). The known order is
// a demo account's delivered order read with its buyer's number (shirin's 2583973877, read-only:
// tracking writes nothing). The code and the number never reach the address bar. The JS budget of
// each state (the form, a result, not found; their answers mocked): desktop only.

const KNOWN = { code: '2583973877', persian: '۲۵۸۳۹۷۳۸۷۷', mobile: '09011234513' }
const TRACK = /\/api\/bff\/order\/track\/$/
const PATH = '/order/track/'

const submit = (page: Page) => page.getByRole('button', { name: 'پیگیری سفارش', exact: true })
/** The form's own alert (not Next's route announcer, also an alert). */
const formAlert = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ })

async function lookUp(page: Page, code: string, mobile: string) {
  await expect(submit(page)).toBeEnabled()
  await page.getByRole('textbox', { name: /کد سفارش/ }).fill(code)
  await page.getByRole('textbox', { name: /شمارهٔ موبایل/ }).fill(mobile)
  const answer = page.waitForResponse(TRACK)
  await submit(page).click()
  return answer
}

test.describe('order tracking', () => {
  test('a known order shows its status; the code and the number stay out of the URL', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto(PATH)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(/پیگیری سفارش/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    // Typed on a Persian keyboard: the page sends ASCII digits.
    const answer = await lookUp(page, KNOWN.persian, '۰۹۰۱ ۱۲۳ ۴۵۱۳')
    expect(answer.status()).toBe(200)
    expect(answer.request().postDataJSON()).toEqual({
      order_code: KNOWN.code,
      mobile_number: KNOWN.mobile,
    })
    const heading = page.getByRole('heading', { level: 2, name: /^سفارش\s[۰-۹]/ })
    await expect(heading).toContainText(KNOWN.persian)
    await expect(heading).toContainText('تکمیل شده')
    await expect(heading).toBeFocused()
    const steps = page.getByRole('list', { name: 'مراحل سفارش' }).getByRole('listitem')
    await expect(steps.last()).toHaveAttribute('aria-current', 'step')
    await expect(page.getByRole('button', { name: /کپی.*کد رهگیری مرسوله/ })).toBeVisible()
    for (const secret of [KNOWN.code, KNOWN.mobile, '9011234513']) {
      expect(page.url(), 'no lookup key in the address').not.toContain(secret)
    }
    expect(new URL(page.url()).search).toBe('')
    expect(errors).toEqual([])
  })

  test('a wrong pair: «سفارشی با این شماره و کد پیدا نشد», the values kept', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(PATH)
    const answer = await lookUp(page, KNOWN.code, '09121234501')
    expect(answer.status()).toBe(404)
    forgiveFailure(page, answer.url(), 404)
    await expect(formAlert(page)).toContainText('سفارشی با این شماره و کد پیدا نشد')
    await expect(page.getByRole('textbox', { name: /کد سفارش/ })).toHaveValue(KNOWN.code)
    await expect(page.getByRole('list', { name: 'مراحل سفارش' })).toHaveCount(0)
    expect(page.url()).not.toContain(KNOWN.code)
    expect(errors).toEqual([])
  })
})

/** The lookup answered by the browser itself (no throttle spent): `status` with `data`. */
async function mockTrack(page: Page, status: number, data: unknown) {
  await page.route(TRACK, (route) =>
    route.fulfill({ status, json: { msg: '', code: status, data } }),
  )
}

const DELIVERED = {
  order_code: KNOWN.code,
  status: 'delivered',
  status_display: 'تکمیل شده',
  placed_at: '2026-08-08T15:00:00+03:30',
  paid_at: null,
  packed_at: '2026-08-09T09:00:00+03:30',
  dispatched_at: '2026-08-09T17:00:00+03:30',
  delivered_at: '2026-08-10T01:00:00+03:30',
  cancelled_at: null,
  returned_at: null,
  postal_tracking_code: '13733116797137594510231',
  item_count: 4,
  total: 8_187_000,
}
const NOT_FOUND = {
  type: 'client_error',
  errors: [
    {
      code: 'order_tracking_not_found',
      detail: 'سفارشی با این شماره موبایل و کد سفارش پیدا نشد.',
      attr: null,
    },
  ],
}
const RECENT = [
  {
    orderCode: '3067562358',
    linkToken: 'e2eBudgetLinkToken0000000000000000000000001',
    paymentUrl: 'http://localhost:3000/order/pay/e2eBudgetLinkToken0000000000000000000000001',
    expiresAt: null,
    A: 53_790_000,
    D: 0,
    total: 53_790_000,
    placedAt: '2026-10-18T15:00:00+03:30',
  },
]

test('the tracking page’s JavaScript, in every state', async ({ page, browser }, info) => {
  test.skip(!measuresBudget(info.project), 'measures both viewports itself')
  test.slow()
  const state = (
    name: string,
    answer: { status: number; data: unknown } | null,
    ready: (measured: Page) => Promise<void>,
  ): BudgetRoute => ({
    name: `order tracking (${name})`,
    path: PATH,
    budget: CHECKOUT_BUDGET_KB,
    prepare: async (measured) => {
      await measured.addInitScript((recent) => {
        localStorage.setItem('ff-guest-orders', JSON.stringify(recent))
      }, RECENT)
      if (answer) await mockTrack(measured, answer.status, answer.data)
    },
    ready,
  })
  const asked = async (measured: Page, done: (measured: Page) => Promise<void>) => {
    await lookUp(measured, KNOWN.code, KNOWN.mobile)
    await done(measured)
  }
  const states = [
    state('form, recent orders', null, async (measured) => {
      await expect(measured.getByRole('heading', { name: 'سفارش‌های اخیر شما' })).toBeVisible()
      await expect(submit(measured)).toBeEnabled()
    }),
    state('result', { status: 200, data: DELIVERED }, (measured) =>
      asked(measured, (m) => expect(m.getByRole('list', { name: 'مراحل سفارش' })).toBeVisible()),
    ),
    state('not found', { status: 404, data: NOT_FOUND }, (measured) =>
      asked(measured, (m) => expect(formAlert(m)).toContainText('پیدا نشد')),
    ),
  ]
  const figures = []
  for (const route of states) {
    figures.push(await measure(page, route, 'desktop'), await measurePhone(browser, route))
  }
  enforce(info, ...figures)
})
