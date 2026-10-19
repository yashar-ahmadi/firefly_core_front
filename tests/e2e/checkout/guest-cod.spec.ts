import { expect, type Page, type Request, type Response } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import { toLatinDigits, toPersianDigits } from '@/lib/format/digits'
import { cartWrite } from '../support/cart-write'
import { waitForCredentialPath } from '../support/credential-url'
import { runMobile } from '../support/guest-order'
import { shellHydrated } from '../support/hydrated'
import { orderGuardTest as test } from '../support/order-guard'
import { applySampleCoupon } from '../support/sample-coupon'
import { chooseShipping, SHIPPING_SELECT } from '../support/shipping-choice'
import { watchErrors } from '../support/watch-errors'

// A guest's pay-on-delivery purchase against the dev backend (Plan 4 Task 10), in the `journeys`
// project (ruling P4-R4: a guest, one at a time). Ahmad Tea and a perfume with a sample coupon:
// `TEA30` (30% off Ahmad Tea, until 2026-10-28 in the sample data, cart-address.md §9), else
// `FREESHIP` (until 2026-11-12), as the API priced it; with neither taken (both run out on a
// read-only backend) the run says so in its annotations and goes on without one
// (support/sample-coupon.ts; `E2E_COUPONS` replaces the codes). The receiver in Tehran; the operator's
// default (peyk Tehran, COD-capable) with «پرداخت در محل». With COD the courier collects the goods,
// the tax and the COD fee; the fare and the packaging stay online (backend `_due_on_delivery`), so
// the goods are above 5,000,000 after the coupon, where peyk Tehran is free with no packaging:
// nothing is charged online (a pure pay-on-delivery order). A pure
// pay-on-delivery order is confirmed by the checkout right after placement (`pay_on_delivery`
// intent), and a confirmed order goes to «در حال انجام», which no customer can cancel (backend
// `CUSTOMER_CANCELLABLE_STATUSES` = awaiting payment; `_open_pay_on_delivery`). So that
// confirmation is held here (the request never leaves the browser: as a dropped connection),
// and the order stays awaiting its confirmation: the thanks page says so, with the code, the
// payment link and «تأیید سفارش» again. Tracking with the code and mobile finds it; it is
// cancelled through its link page, and by the `orders` guard (support/order-guard.ts) if the
// test ends before. Per run: 1 coupon apply (2 once TEA30 has run out), 1 placement, 0 payment
// intents (the one held),
// 1 tracking lookup (`order_tracking` 20/min), about 4 `order_payment_link` calls, 1 cancel.

/** TEA30's product, and enough beside it for free peyk (goods ≥ 5,000,000 after any coupon). */
const PRODUCTS = ['ahmad-tea-earl-grey', 'perfume-oud-royal']
const BFF = { 'X-Requested-With': 'ff' }
const INTENT = /\/api\/bff\/payment\/link\/[^/]+\/intent\/$/
/** A console error about the held confirmation (its URL closes the line). */
const aboutHeld = (error: string) => /\/api\/bff\/payment\/link\/[^/]+\/intent\/\)$/.test(error)
const toman = (amount: number) => `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`
const cartOf = async (response: Response) => ((await response.json()) as { data: Cart }).data

async function geo<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/bff/transportation/${path}`, { headers: BFF })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: Paginated<T> }).data.results
}

test('a guest: a sample coupon, Tehran, pay on delivery; thanks, tracked, cancelled through its link', async ({
  page,
  orders,
}) => {
  test.slow()
  const errors = watchErrors(page)
  const mobile = runMobile()
  // The order, from the placement's answer: handed to the guard before anything is asserted.
  const seen: { order?: OrderPlacementResult } = {}
  let reading: Promise<unknown> = Promise.resolve()
  page.on('response', (response) => {
    if (new URL(response.url()).pathname !== '/api/bff/order/place/' || !response.ok()) return
    reading = response
      .json()
      .then(({ data }: { data: OrderPlacementResult }) => {
        seen.order = data
        const token = new URL(data.payment_url!).pathname.split('/').filter(Boolean).at(-1)!
        orders.track({ code: data.order_code, token })
      })
      .catch(() => undefined)
    orders.settle(reading)
  })
  // The confirmation held: it never reaches the backend (the order stays cancellable).
  const held: Request[] = []
  await page.route(INTENT, (route) => {
    held.push(route.request())
    return route.abort('failed')
  })

  for (const slug of PRODUCTS) {
    await page.goto(`/product/${slug}/`)
    await shellHydrated(page)
    await cartWrite(page, { method: 'POST', path: 'cart/item/add/', label: `add ${slug}` }, () =>
      page
        .getByRole('region', { name: 'خرید', exact: true })
        .getByRole('button', { name: 'افزودن به سبد خرید' })
        .click(),
    )
  }

  // A sample coupon on the cart page, shown as the API priced it (whichever it took).
  await page.goto('/cart/')
  const { applied, refused } = await applySampleCoupon(page)
  const coupon = applied?.code ?? null
  const said = refused.map(({ code, refusal }) => `${code}: ${refusal}`).join(', ')
  if (refused.length > 0) {
    const description = applied
      ? `${coupon} applied after ${said}`
      : `no sample coupon taken (${said}): the journey goes on without one`
    test.info().annotations.push({ type: 'coupon', description })
  }
  const summary = page.getByRole('region', { name: 'خلاصه\u{0654} سبد خرید' })
  if (applied) {
    const cart = applied.taken
    expect(cart.coupon.code).toBe(coupon)
    await expect(summary).toContainText(coupon!)
    if (cart.coupon.discount_type === 'free_shipping') {
      await expect(summary).toContainText('ارسال رایگان')
    } else {
      expect(cart.coupon_discount).toBeGreaterThan(0)
      await expect(summary).toContainText(toman(cart.coupon_discount))
    }
    await expect(summary).toContainText(toman(cart.total))
  }

  // The receiver in Tehran; the operator's default shipping, then «پرداخت در محل» on it.
  await page.goto('/checkout/')
  const receiver = page.getByRole('region', { name: /گیرنده و آدرس/ })
  await expect(receiver.getByRole('button', { name: 'ادامه' })).toBeEnabled()
  await receiver.getByLabel(/^نام گیرنده/).fill('آزمون')
  await receiver.getByLabel(/نام خانوادگی گیرنده/).fill('پرداخت در محل')
  await receiver.getByLabel(/شمارهٔ موبایل گیرنده/).fill(mobile)
  const tehran = (await geo<Province>(page, 'province/list/?limit=1500')).find(
    (province) => province.name === 'تهران',
  )!
  const cities = await geo<City>(page, `city/list/?province=${tehran.id}&limit=1500`)
  const city = cities.find((item) => item.name === 'تهران')!
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
  const { response: chosen } = await chooseShipping(page, shipping, {
    lead: () => receiver.getByRole('button', { name: 'ادامه' }).click(),
    before: await cartOf(destination),
    retry: () => page.reload(),
  })
  const prepaid = await cartOf(chosen)
  expect(prepaid.coupon.code, 'the coupon kept through the destination').toBe(coupon)
  await shipping.getByRole('button', { name: /ویرایش/ }).click()
  const codBox = shipping.getByRole('checkbox', { name: /پرداخت در محل/ })
  const cod = await cartOf(
    await cartWrite(
      page,
      {
        ...SHIPPING_SELECT,
        body: (data) => (data as { cash_on_delivery?: boolean }).cash_on_delivery === true,
        label: 'COD',
      },
      () => codBox.check(),
      { before: prepaid },
    ),
  )
  expect(cod.shipping.cash_on_delivery).toBe(true)
  expect(cod.goods_payable, 'peyk Tehran is free from 5,000,000').toBeGreaterThanOrEqual(5_000_000)
  expect(cod.amount_charged_online, 'nothing charged online').toBe(0)
  expect(cod.amount_to_collect_on_delivery).toBe(cod.total)
  await shipping.getByRole('button', { name: 'ادامه با این روش ارسال' }).click()

  const payment = page.getByRole('region', { name: /۳.*پرداخت/ })
  await expect(payment).toContainText('پرداخت در محل')
  const review = page.getByRole('region', { name: /بازبینی و ثبت سفارش/ })
  await expect(review).toHaveAttribute('data-state', 'active')
  await expect(page.getByRole('region', { name: 'خلاصه\u{0654} سفارش' })).toContainText(
    toman(cod.total),
  )
  for (const name of [/قوانین و مقررات/, /سن قانونی/])
    await review.getByRole('checkbox', { name }).check()

  const placement = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/bff/order/place/' &&
      response.request().method() === 'POST',
  )
  await review.getByRole('button', { name: 'ثبت و تأیید سفارش' }).click()
  expect((await placement).status(), 'a new order').toBe(201)
  await reading
  expect(seen.order, 'the placement’s answer').toBeDefined()
  const order = seen.order!
  expect((await placement).request().postDataJSON()).toMatchObject({ expected_total: cod.total })

  // The thanks page: the code, awaiting its confirmation, its link (to confirm), «تأیید سفارش».
  await page.waitForURL(new RegExp(`/checkout/thanks/${order.order_code}/$`))
  expect(held, 'the confirmation was asked for once, and held').toHaveLength(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'سفارش ثبت شد اما هنوز تأیید نشده است',
  )
  const shown = toPersianDigits(order.order_code)
  await expect(page.getByText(shown).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'تأیید سفارش' })).toBeVisible()
  // The order's own link (compared, never printed: its token is a credential).
  const token = new URL(order.payment_url!).pathname.split('/').filter(Boolean).at(-1)!
  const href = await page.getByRole('link', { name: 'لینک تأیید سفارش' }).getAttribute('href')
  expect(href === `/order/pay/${token}/`, 'the payment link is the order’s own').toBe(true)
  const cart = await page.request.get('/api/bff/cart/', { headers: BFF })
  expect(((await cart.json()) as { data: Cart }).data.is_empty, 'the cart is spent').toBe(true)

  // Tracking: the code handed over by the thanks page's link, the receiver's mobile typed.
  await page.getByRole('link', { name: /پیگیری سفارش با کد سفارش/ }).click()
  await expect(page).toHaveURL(/\/order\/track\/$/)
  const codeField = page.getByRole('textbox', { name: /کد سفارش/ })
  await expect(codeField).not.toHaveValue('')
  const handed = toLatinDigits(await codeField.inputValue())
  expect(handed === order.order_code, 'the order’s code handed over (never printed)').toBe(true)
  await page.getByRole('textbox', { name: /شمارهٔ موبایل/ }).fill(mobile)
  const lookup = page.waitForResponse(/\/api\/bff\/order\/track\/$/)
  await page.getByRole('button', { name: 'پیگیری سفارش', exact: true }).click()
  expect((await lookup).status(), 'tracking finds it').toBe(200)
  const result = page.getByRole('heading', { level: 2, name: /^سفارش\s[۰-۹]/ })
  await expect(result).toContainText(shown)
  await expect(result).toContainText('در انتظار پرداخت')

  // Cancelled through its link page (the safe choice focused first).
  await page.goBack()
  await page.getByRole('link', { name: 'لینک تأیید سفارش' }).click()
  await waitForCredentialPath(page, /^\/order\/pay\/[^/]+\/$/, 'the order’s link page')
  // Nothing to pay online: the link page asks for a confirmation, before its deadline to confirm.
  await expect(page.getByRole('heading', { level: 1, name: 'تأیید سفارش' })).toBeVisible()
  await expect(page.getByText('مهلت تأیید:', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'لغو سفارش' }).click()
  const dialog = page.getByRole('dialog', { name: 'لغو سفارش' })
  await expect(dialog.getByRole('button', { name: 'بازگشت' })).toBeFocused()
  const cancel = page.waitForResponse(/\/api\/bff\/order\/pay\/[^/]+\/cancel\/$/)
  await dialog.getByRole('button', { name: 'لغو سفارش' }).click()
  expect((await cancel).status(), 'the order cancelled').toBe(200)
  await expect(page.getByRole('heading', { name: 'سفارش لغو شد' })).toBeFocused()
  expect(held, 'nothing confirmed it on the way').toHaveLength(1)
  // The held confirmation's aborted request is the one console error expected here.
  expect(errors.filter((error) => !aboutHeld(error))).toEqual([])
})
