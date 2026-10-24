import { test as base, expect, type Page, type Response } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'
import type { ShippingOptionList } from '@/lib/api/types/shipping'
import { cartWrite } from '../support/cart-write'
import { confirmGuestReceiver, seedGuestDestination } from '../support/checkout-states'
import { shellHydrated } from '../support/hydrated'
import { fulfilUnlessDropped, liveJson } from '../support/live-route'
import { chooseShipping } from '../support/shipping-choice'
import { watchErrors } from '../support/watch-errors'

// The checkout's first two steps against the dev backend (Plan 4 Task 2), as a guest: the cart
// is the browser context's own guest cart (`ff_cart`), never a demo account's. One test per
// project: a product in the cart, `/checkout/`, the receiver form, Tehran (the province by its
// name, a city from the live list), the options for that destination, the operator's default
// chosen for the shopper (or, with none, the section asking and the test choosing:
// support/shipping-choice.ts), and the summary's shipping row as the API priced it. Cart writes:
// an add, the destination and the shipping choice (each through `cartWrite`: the dev SQLite
// «database is locked» is retried once, logged). Nothing is ordered (Task 3); the cart is
// cleared after the test, however it ends (the `guestCart` fixture's teardown).

const PRODUCT = { slug: 'nestle-coffee-gold' }
const BFF = { 'X-Requested-With': 'ff' }
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
/** The summary sits beside the steps from lg; below it, folded at the top. */
const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024
const toman = (amount: number) => `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`

async function geo<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/bff/transportation/${path}`, { headers: BFF })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: Paginated<T> }).data.results
}

const cartOf = async (response: Response) => ((await response.json()) as { data: Cart }).data

/** The browser context's guest cart goes after the test, however it ends (a failure, a timeout). */
const test = base.extend<{ guestCart: void }>({
  guestCart: [
    async ({ page }, use) => {
      await use()
      // A route's handler still answering a read when the test ends (the page reads the options
      // again after a choice) finishes first: its live fetch would otherwise fail with «Test
      // ended», an error outside any test that fails the run.
      await page.unrouteAll({ behavior: 'wait' })
      // Its lines hold no stock, but the dev backend is shared.
      await page.request.delete('/api/bff/cart/clear/', { headers: BFF }).catch(() => undefined)
    },
    { auto: true },
  ],
})

/** What the summary's «هزینهٔ ارسال» row says for the API's cart (cart-summary.tsx). */
function shippingRow(cart: Cart): string {
  if (cart.shipping.freight_paid_by_recipient) return 'پس\u{200C}کرایه'
  return cart.shipping_cost === 0 ? 'رایگان' : toman(cart.shipping_cost)
}

test('a guest checks out up to shipping: receiver, Tehran, the default option chosen', async ({
  page,
}) => {
  const errors = watchErrors(page)
  await page.goto(`/product/${PRODUCT.slug}/`)
  await shellHydrated(page)
  const buy = page.getByRole('region', {
    name: isPhone(page) ? 'نوار خرید' : 'خرید',
    exact: true,
  })
  await cartWrite(page, { method: 'POST', path: 'cart/item/add/', label: 'add' }, () =>
    buy.getByRole('button', { name: 'افزودن به سبد خرید' }).click(),
  )

  await page.goto('/checkout/')
  await expect(page).toHaveTitle(/^تکمیل خرید \|/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const receiver = page.getByRole('region', { name: /گیرنده و آدرس/ })
  await expect(receiver).toHaveAttribute('data-state', 'active')
  await expect(page.getByRole('region', { name: /روش ارسال/ })).toHaveAttribute(
    'data-state',
    'locked',
  )
  // The form's submit button is enabled once the page has hydrated.
  await expect(receiver.getByRole('button', { name: 'ادامه' })).toBeEnabled()
  await receiver.getByLabel(/^نام گیرنده/).fill('آزمون')
  await receiver.getByLabel(/نام خانوادگی گیرنده/).fill('خودکار')
  await receiver.getByLabel(/شمارهٔ موبایل گیرنده/).fill('۰۹۱۲۱۲۳۴۵۶۷')

  // Tehran by its name, then a city of it from the live list (its own name, Tehran).
  const tehran = (await geo<Province>(page, 'province/list/?limit=1500')).find(
    (province) => province.name === 'تهران',
  )
  expect(tehran, 'the live province list has تهران').toBeDefined()
  const cities = await geo<City>(page, `city/list/?province=${tehran!.id}&limit=1500`)
  const city = cities.find((item) => item.name === 'تهران') ?? cities[0]!
  await receiver.getByLabel('استان').selectOption({ label: tehran!.name })
  const citySelect = receiver.getByLabel(/^شهر/)
  await expect(citySelect.getByRole('option', { name: city.name, exact: true })).toBeAttached()
  const destination = await cartWrite(
    page,
    { method: 'POST', path: 'cart/destination/', label: 'destination' },
    () => citySelect.selectOption({ label: city.name }),
  )
  expect((await cartOf(destination)).destination?.city_id).toBe(city.id)

  await receiver.getByLabel(/آدرس کامل/).fill('خیابان آزمون، کوچهٔ یک')
  await receiver.getByLabel(/کد پستی/).fill('۱۲۳۴۵۶۷۸۹۰')
  // «ادامه»: the shipping step opens, and the operator's default is chosen (none: the test
  // chooses once the section asks).
  const shipping = page.getByRole('region', { name: /روش ارسال/ })
  const { response: selected } = await chooseShipping(page, shipping, {
    lead: () => receiver.getByRole('button', { name: 'ادامه' }).click(),
    before: await cartOf(destination),
    retry: () => page.reload(),
  })
  const cart = await cartOf(selected)
  expect(cart.shipping.is_selected && cart.shipping.is_available).toBe(true)

  await expect(receiver).toHaveAttribute('data-state', 'done')
  await expect(receiver).toContainText('آزمون خودکار')
  await expect(shipping).toContainText(cart.shipping.title!)

  // The summary: the API's own shipping row and total.
  if (!isWide(page)) {
    const folded = page.locator('details[data-summary="phone"]')
    await expect(folded.locator('summary')).toContainText(`جمع کل: ${toman(cart.total)}`)
    await folded.locator('summary').click()
  }
  // The page's own summary (the aside, or the folded one on phones): the review step, open by
  // now, shows the same summary in its body as well.
  const summary = (
    isWide(page) ? page.getByRole('complementary') : page.locator('details[data-summary="phone"]')
  ).getByRole('region', { name: 'خلاصه\u{0654} سفارش' })
  const row = summary
    .locator('div')
    .filter({ has: page.getByRole('term').filter({ hasText: 'هزینه\u{0654} ارسال' }) })
  await expect(row).toContainText(shippingRow(cart))
  await expect(summary).toContainText(toman(cart.total))
  expect(errors).toEqual([])
})

test('no default option for the destination: the section asks, the shopper chooses', async ({
  page,
}) => {
  const errors = watchErrors(page)
  // The live options, each one's fare collected at the door: the operator has no default
  // (`defaultOption` takes only a sender-paid one), so nothing is chosen for the shopper.
  await page.route(/\/api\/bff\/cart\/shipping\/option\/list\/$/, async (route) => {
    const live = await liveJson<{ data: ShippingOptionList }>(route)
    if (live === null) return route.abort().catch(() => {})
    const { data } = live.body
    data.options = data.options.map((option) => ({ ...option, freight_payer: 'recipient' }))
    await fulfilUnlessDropped(route, { response: live.response, json: live.body })
  })
  await confirmGuestReceiver(page, await seedGuestDestination(page))
  const before = await page.request.get('/api/bff/cart/', { headers: BFF })
  await page.goto('/checkout/')
  const shipping = page.getByRole('region', { name: /روش ارسال/ })
  await expect(shipping).toHaveAttribute('data-state', 'active')
  const { response, auto } = await chooseShipping(page, shipping, {
    before: ((await before.json()) as { data: Cart }).data,
  })
  expect(auto, 'the shopper chose: no default to choose').toBe(false)
  const cart = await cartOf(response)
  expect(cart.shipping.is_selected && cart.shipping.is_available).toBe(true)
  await expect(shipping).toHaveAttribute('data-state', 'done')
  await expect(shipping).toContainText(cart.shipping.title!)
  expect(errors).toEqual([])
})
