import { expect, type Page, type Response } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import { cartWrite } from '../support/cart-write'
import { waitForCredentialPath } from '../support/credential-url'
import { shellHydrated } from '../support/hydrated'
import { orderGuardTest as test } from '../support/order-guard'
import { chooseShipping } from '../support/shipping-choice'
import { watchErrors } from '../support/watch-errors'

// A guest places an order against the dev backend (Plan 4 Task 3), in the `journeys` project
// (ruling P4-R4: one at a time, never a demo account): a product, the receiver, Tehran, the
// operator's default shipping, the shop's default payment route, the review with the operator's
// two sentences ticked, «ثبت سفارش و پرداخت». The dev backend cannot run a gateway (digest §11
// #3) and, since the backend's 2026-11-05 round, says so up front: its gateway list names only
// usable gateways (none here, BACKEND-ISSUES M-4) and its method list closes both bank routes
// («درگاه پرداخت پیکربندی نشده است.»). So the default route is the first enabled one after the
// bank, card to card: the order is placed (201), its card-transfer intent goes through the guest's
// link door (201) and its page opens (a full page load: its URL holds the payment's uuid). The
// order is cancelled through its link (`POST order/pay/<token>/cancel/`, allowed while it awaits
// payment, its open attempt closed with it) by the `orders` guard (support/order-guard.ts, a
// fixture: also after a timeout): the token is taken from any 2xx placement the page receives,
// before anything is asserted. Per run: 1 placement, 1 payment intent (of the 30/h
// `payment_attempt`), 1 cancellation; the receiver's mobile is new for each run (the guest's
// unpaid-orders ceiling counts per mobile). Cart writes go through `cartWrite` (the dev SQLite
// lock is repeated once, logged).

const PRODUCT = { slug: 'nestle-coffee-gold' }
const BFF = { 'X-Requested-With': 'ff' }

async function geo<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/bff/transportation/${path}`, { headers: BFF })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: Paginated<T> }).data.results
}

const cartOf = async (response: Response) => ((await response.json()) as { data: Cart }).data
/** The order's payment intents, through the guest's link door. */
const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/link\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)
const CARD_PAGE = /^\/payment\/card-transfer\/[0-9a-f-]{36}\/$/

/** A mobile of this run: 0912 and 7 digits from the clock. */
const runMobile = () => `0912${String(Date.now()).slice(-7)}`

test('a guest places an order; no usable gateway: card to card by default, its page opens', async ({
  page,
  orders,
}) => {
  const errors = watchErrors(page)
  // The order's link token, from any 2xx answer to the placement: handed to the guard at once.
  let token: string | null = null
  let reading: Promise<unknown> = Promise.resolve()
  page.on('response', (response) => {
    const placement =
      new URL(response.url()).pathname === '/api/bff/order/place/' &&
      response.request().method() === 'POST' &&
      response.ok()
    if (!placement) return
    reading = response
      .json()
      .then((body: { data?: Partial<OrderPlacementResult> }) => {
        const url = body.data?.payment_url
        if (url) token ??= new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? null
        if (token && body.data?.order_code) orders.track({ code: body.data.order_code, token })
      })
      .catch(() => undefined)
    orders.settle(reading)
  })
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
  await receiver.getByLabel(/شمارهٔ موبایل گیرنده/).fill(runMobile())
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

  // The shop's default route: the first enabled in the operator's order, the bank closed (no
  // usable gateway), so card to card.
  const payment = page.getByRole('region', { name: /۳.*پرداخت/ })
  await expect(payment).toHaveAttribute('data-state', 'done')
  await expect(payment).toContainText('کارت به کارت')
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
  const intent = page.waitForResponse(isIntent)
  await place.click()
  const placement = await placed
  await reading
  expect(placement.status(), 'a new order').toBe(201)
  expect(token, 'the order’s link token').not.toBeNull()
  expect(placement.request().postDataJSON()).toMatchObject({ expected_total: cart.total })
  expect(placement.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)

  const card = await intent
  expect(card.status(), 'a card-transfer attempt').toBe(201)
  expect(card.request().postDataJSON()).toEqual({ route: 'card_transfer' })
  // Its page, a full page load (compared, never printed: the uuid is a credential).
  await waitForCredentialPath(page, CARD_PAGE, 'the card-transfer page')
  await expect(page.getByRole('heading', { level: 1, name: 'پرداخت کارت به کارت' })).toBeVisible()
  // The purchase is over: the cart (its badge) is empty.
  const after = await page.request.get('/api/bff/cart/', { headers: BFF })
  expect(((await after.json()) as { data: Cart }).data.is_empty).toBe(true)
  expect(errors).toEqual([])
})
