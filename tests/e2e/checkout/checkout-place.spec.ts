import { expect, test, type Page, type Response } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'
import type { OrderPaymentLink, OrderPlacementResult } from '@/lib/api/types/order'
import { cartWrite } from '../support/cart-write'
import { shellHydrated } from '../support/hydrated'
import { chooseShipping } from '../support/shipping-choice'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// A guest places an order against the dev backend (Plan 4 Task 3), in the `journeys` project
// (ruling P4-R4: one at a time, never a demo account): a product, the receiver, Tehran, the
// operator's default shipping, the shop's default payment route (the bank), the review with the
// operator's two sentences ticked, «ثبت سفارش و پرداخت». The order is placed (201) and the bank
// intent goes through the guest's link door; the dev backend cannot run a gateway and answers
// `503 gateway_not_configured`: the page must not navigate, must say the bank cannot be used,
// offer the support line and the other routes, and keep the order. Whatever happens, the order is
// cancelled through its link (`POST order/pay/<token>/cancel/`, allowed while it awaits
// payment), so the dev database keeps no open unpaid order. Per run: 1 placement, 1 payment
// intent (the 30/h `payment_attempt` budget), 1 cancellation; the receiver's mobile is new for
// each run (the guest's unpaid-orders ceiling counts per mobile). Cart writes go through
// `cartWrite` (the dev SQLite lock is repeated once, logged).

const PRODUCT = { slug: 'nestle-coffee-gold' }
const BFF = { 'X-Requested-With': 'ff' }

async function geo<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/bff/transportation/${path}`, { headers: BFF })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: Paginated<T> }).data.results
}

const cartOf = async (response: Response) => ((await response.json()) as { data: Cart }).data

/** A mobile of this run: 0912 and 7 digits from the clock. */
const runMobile = () => `0912${String(Date.now()).slice(-7)}`

test('a guest places an order; the dev bank is not configured: no navigation, the order kept', async ({
  page,
}) => {
  const errors = watchErrors(page)
  let token: string | null = null
  try {
    await page.goto(`/product/${PRODUCT.slug}/`)
    await shellHydrated(page)
    await cartWrite(page, { method: 'POST', path: 'cart/item/add/', label: 'add' }, () =>
      page
        .getByRole('region', { name: 'خرید', exact: true })
        .getByRole('button', { name: 'افزودن به سبد خرید' })
        .click(),
    )

    await page.goto('/checkout/')
    const receiver = page.getByRole('region', { name: /گیرنده و آدرس/ })
    await expect(receiver.getByRole('button', { name: 'ادامه' })).toBeEnabled()
    await receiver.getByLabel(/^نام گیرنده/).fill('آزمون')
    await receiver.getByLabel(/نام خانوادگی گیرنده/).fill('ثبت سفارش')
    await receiver.getByLabel(/شماره موبایل گیرنده/).fill(runMobile())
    const tehran = (await geo<Province>(page, 'province/list/?limit=1500')).find(
      (province) => province.name === 'تهران',
    )!
    const cities = await geo<City>(page, `city/list/?province=${tehran.id}&limit=1500`)
    const city = cities.find((item) => item.name === 'تهران') ?? cities[0]!
    await receiver.getByLabel('استان').selectOption({ label: tehran.name })
    const citySelect = receiver.getByLabel(/^شهر/)
    await expect(citySelect.getByRole('option', { name: city.name, exact: true })).toBeAttached()
    const destination = await cartWrite(
      page,
      { method: 'POST', path: 'cart/destination/', label: 'destination' },
      () => citySelect.selectOption({ label: city.name }),
    )
    await receiver.getByLabel(/آدرس کامل/).fill('خیابان آزمون، کوچهٔ یک')
    await receiver.getByLabel(/کد پستی/).fill('۱۲۳۴۵۶۷۸۹۰')
    const shipping = page.getByRole('region', { name: /روش ارسال/ })
    const { response: selected } = await chooseShipping(page, shipping, {
      lead: () => receiver.getByRole('button', { name: 'ادامه' }).click(),
      before: await cartOf(destination),
      retry: () => page.reload(),
    })
    const cart = await cartOf(selected)

    // The shop's default route (the bank, the first enabled in the operator's order) is chosen.
    const payment = page.getByRole('region', { name: /۳.*پرداخت/ })
    await expect(payment).toHaveAttribute('data-state', 'done')
    await expect(payment).toContainText('درگاه بانکی')
    const review = page.getByRole('region', { name: /بازبینی و ثبت سفارش/ })
    await expect(review).toHaveAttribute('data-state', 'active')
    for (const name of [/قوانین و مقررات/, /سن قانونی/])
      await review.getByRole('checkbox', { name }).check()
    const place = review.getByRole('button', { name: 'ثبت سفارش و پرداخت' })
    await expect(place).not.toHaveAttribute('aria-disabled', 'true')

    const placed = page.waitForResponse(
      (response) =>
        response.url().includes('/api/bff/order/place/') && response.request().method() === 'POST',
    )
    const intent = page.waitForResponse((response) =>
      /\/api\/bff\/payment\/link\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname),
    )
    await place.click()
    const placement = await placed
    expect(placement.status(), 'a new order').toBe(201)
    const order = ((await placement.json()) as { data: OrderPlacementResult }).data
    token = new URL(order.payment_url!).pathname.split('/').filter(Boolean).at(-1)!
    expect(placement.request().postDataJSON()).toMatchObject({ expected_total: cart.total })
    expect(placement.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)

    const bank = await intent
    expect(bank.status()).toBe(503)
    expect(
      ((await bank.json()) as { data: { errors: { code: string }[] } }).data.errors[0]!.code,
    ).toBe('gateway_not_configured')
    forgiveFailure(page, bank.url(), 503)

    // No navigation: the order stays here, the bank routes gone, the support line, the others.
    const placedOrder = page.getByRole('region', { name: 'سفارش شما ثبت شد' })
    await expect(placedOrder).toBeVisible()
    const alert = placedOrder.getByRole('alert')
    await expect(alert).toContainText('پرداخت با درگاه بانکی در این فروشگاه اکنون ممکن نیست')
    await expect(alert.getByRole('link', { name: /پشتیبانی/ })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/checkout/')
    const routes = page.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
    await expect(routes.getByRole('radio', { name: /کارت به کارت/ })).toBeVisible()
    await expect(routes.getByRole('radio', { name: /درگاه بانکی/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'لینک پرداخت سفارش' })).toHaveAttribute(
      'href',
      `/order/pay/${token}/`,
    )
    // The purchase is over: the cart (its badge) is empty.
    const after = await page.request.get('/api/bff/cart/', { headers: BFF })
    expect(((await after.json()) as { data: Cart }).data.is_empty).toBe(true)
    expect(errors).toEqual([])
  } finally {
    if (token) {
      // The order awaits payment, so its link may cancel it (order digest §3.1.10).
      const cancelled = await page.request.post(`/api/bff/order/pay/${token}/cancel/`, {
        headers: BFF,
        data: {},
      })
      const body = (await cancelled.json().catch(() => null)) as { data?: OrderPaymentLink } | null
      if (!cancelled.ok() || body?.data?.status !== 'cancelled') {
        console.warn(`[checkout-place] the order was not cancelled: ${cancelled.status()}`)
      }
      expect(cancelled.status(), 'the order is cancelled through its link').toBe(200)
    }
    await page.request.delete('/api/bff/cart/clear/', { headers: BFF }).catch(() => undefined)
  }
})
