import { expect, type Page } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { DashboardSummary } from '@/lib/api/types/dashboard'
import type { OrderListItem } from '@/lib/api/types/order-detail'
import type { AwaitingReviewOrder } from '@/lib/api/types/order-review'
import { fulfilUnlessDropped, liveJson, settleRoutes } from '../support/live-route'
import { signedInTest as sessionTest } from '../support/session'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// «سفارش‌های من», an order's page and «در انتظار دیدگاه» against the dev backend (Plan 4 Task 8),
// with the project's shared session (`signedInTest`: sara). Read only (ruling P4-R4: no order,
// payment, cancellation, cart or review is ever written as sara): every write the pages could make
// is refused here, but the review's submission, which is answered here (a review cannot be taken
// back), and no figure that grows across runs is asserted.

/** Sara's session; the routes' live handlers finish before a test ends (`settleRoutes`). */
const signedInTest = sessionTest.extend<{ routesSettle: void }>({
  routesSettle: [settleRoutes, { auto: true }],
})

const BFF = { 'X-Requested-With': 'ff' }
/** Writes these pages could send: an intent, a cancel, a reorder, a review (answered here). */
const WRITES =
  /\/api\/bff\/(?:payment\/order\/[^/]+\/intent|order\/\d{10}\/cancel|cart\/reorder)\/$/
const REVIEW = /\/api\/bff\/order\/\d{10}\/review\/$/
const SAVED = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'

async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/bff/${path}`, { headers: BFF })
  expect(response.ok(), `${path} through the BFF`).toBe(true)
  return ((await response.json()) as { data: T }).data
}

/** Refuses every write (none is expected); returns the ones tried. */
async function refuseWrites(page: Page): Promise<string[]> {
  const tried: string[] = []
  await page.route(WRITES, (route) => {
    tried.push(`${route.request().method()} ${route.request().url()}`)
    return route.abort()
  })
  return tried
}

const tabs = (page: Page) => page.getByRole('navigation', { name: 'گروه سفارش‌ها' })

signedInTest(
  'the orders: tabs from the summary, a group, an order’s page with its payments',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await refuseWrites(page)
    const summary = await read<DashboardSummary>(page, 'dashboard/summary/')
    const delivered = (
      await read<Paginated<OrderListItem>>(page, 'order/list/?status_group=delivered&limit=1')
    ).results[0]
    expect(delivered, 'sara has a delivered order (the dev data)').toBeDefined()

    const response = await page.goto('/account/orders/')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle(/^سفارش‌های من \| /)
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش‌های من' })).toBeVisible()
    // «همه», then the summary's groups with their labels as given.
    const links = tabs(page).getByRole('link')
    await expect(links).toHaveCount(summary.orders.groups.length + 1)
    await expect(links.first()).toHaveAttribute('aria-current', 'page')
    for (const group of summary.orders.groups) {
      await expect(
        tabs(page).getByRole('link', { name: new RegExp(`^${group.label}`) }),
      ).toBeVisible()
    }
    await expect(page.getByRole('article').first()).toBeVisible()

    // A group: its URL, its tab current, only its orders.
    const group = summary.orders.groups.find((item) => item.key === 'delivered')!
    await tabs(page)
      .getByRole('link', { name: new RegExp(`^${group.label}`) })
      .click()
    await expect(page).toHaveURL(/\/account\/orders\/\?group=delivered$/)
    await expect(
      tabs(page).getByRole('link', { name: new RegExp(`^${group.label}`) }),
    ).toHaveAttribute('aria-current', 'page')
    const cards = page.getByRole('article')
    // The list before stays on screen (busy) while the group's is read.
    await expect(page.getByRole('list', { name: 'سفارش‌های من' })).not.toHaveAttribute('aria-busy')
    await expect(cards).toHaveCount(Math.min(group.count, 20))
    for (const card of await cards.all())
      await expect(card).toContainText(delivered!.status_display)

    // An order's page, from its card.
    const code = delivered!.order_code
    await page
      .getByRole('link', { name: /^جزئیات سفارش/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/account\/orders\/\d{10}\/$/)
    const opened = new URL(page.url()).pathname.split('/').at(-2)!
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^سفارش [۰-۹]{10}$/)
    await expect(page.getByRole('list', { name: 'مراحل سفارش' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'مبلغ سفارش' })).toContainText('مبلغ کل')
    const payments = page.getByRole('region', { name: 'پرداخت‌ها' })
    await expect(
      payments
        .getByRole('list', { name: 'پرداخت‌های سفارش' })
        .or(payments.getByText('هنوز پرداختی')),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'خرید دوباره' })).toBeVisible()
    // «کد QR»: the API's picture, the code it holds under it.
    await page.getByRole('button', { name: 'کد QR' }).click()
    const qr = page.getByRole('dialog', { name: 'کد QR سفارش' })
    await expect(qr.getByRole('img', { name: /کد QR سفارش/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(qr).toBeHidden()
    // The newest delivered order (the list's first card).
    expect(opened).toBe(code)
    expect(tried).toEqual([])
    expect(errors).toEqual([])
  },
)

signedInTest(
  'an order that is not hers (or none) is a real 404 in the account shell',
  async ({ page }) => {
    const errors = watchErrors(page)
    const url = '/account/orders/0000000001/'
    const response = await page.goto(url)
    expect(response?.status()).toBe(404)
    forgiveFailure(page, new URL(url, page.url()).toString(), 404)
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش پیدا نشد' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'سفارش‌های من' }).last()).toHaveAttribute(
      'href',
      '/account/orders/',
    )
    expect(errors).toEqual([])
  },
)

signedInTest(
  'the purchases awaiting a review; a review sent (answered here, never saved)',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await refuseWrites(page)
    const awaiting = await read<Paginated<AwaitingReviewOrder>>(page, 'order/review/awaiting/list/')
    const first = awaiting.results[0]
    signedInTest.skip(!first, 'nothing of sara awaits a review')
    const product = first!.products[0]!
    const sent: unknown[] = []
    await page.route(REVIEW, (route) => {
      sent.push(route.request().postDataJSON())
      return route.fulfill({ status: 201, json: { msg: SAVED, code: 201, data: {} } })
    })
    // Once «sent», the list as the server would then answer it: without that purchase. A read
    // the page drops on its way (a refetch cancelling it) has its live response disposed: it is
    // let go, never read (`liveJson`).
    await page.route(/\/api\/bff\/order\/review\/awaiting\/list\//, async (route) => {
      const live = await liveJson<{ data: Paginated<AwaitingReviewOrder> }>(route)
      if (live === null) return route.abort().catch(() => {})
      const { body } = live
      if (sent.length > 0) {
        body.data.results = body.data.results
          .map((order) => ({
            ...order,
            products: order.products.filter(
              (item) => item.id !== product.id || order.order_code !== first!.order_code,
            ),
          }))
          .filter((order) => order.products.length > 0)
      }
      return fulfilUnlessDropped(route, { response: live.response, json: body })
    })

    const response = await page.goto(
      `/account/reviews/?order=${first!.order_code}&product=${product.slug}`,
    )
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(/^در انتظار دیدگاه \| /)
    const card = page.getByRole('article', { name: product.name })
    // The order page's link lands on this purchase: its button has the focus.
    await expect(card.getByRole('button', { name: /ثبت دیدگاه/ })).toBeFocused()
    await card.getByRole('button', { name: /ثبت دیدگاه/ }).click()
    const dialog = page.getByRole('dialog', { name: product.name })
    await expect(dialog.getByRole('radiogroup', { name: /امتیاز شما/ })).toBeVisible()
    // The rating is required: nothing is sent without it.
    await dialog.getByRole('textbox', { name: /متن دیدگاه/ }).fill('آزمون خودکار؛ ذخیره نمی‌شود.')
    await dialog.getByRole('button', { name: 'ثبت دیدگاه' }).click()
    await expect(dialog.getByText('امتیاز این کالا را انتخاب کنید.')).toBeVisible()
    expect(sent).toHaveLength(0)
    // A visually hidden radio under its star: checked as a click on the star would.
    await dialog.getByRole('radio', { name: /^۴ ستاره/ }).check({ force: true })
    await dialog.getByRole('button', { name: 'ثبت دیدگاه' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(SAVED).first()).toBeVisible()
    expect(sent).toEqual([
      { product_id: product.id, rating: 4, review: 'آزمون خودکار؛ ذخیره نمی‌شود.' },
    ])
    await expect(page.getByRole('article', { name: product.name })).toHaveCount(0)
    expect(tried).toEqual([])
    expect(errors).toEqual([])
  },
)
