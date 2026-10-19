import { expect, type Response } from '@playwright/test'
import type { Cart, CartReorderResult } from '@/lib/api/types/cart'
import { cartWrite } from '../support/cart-write'
import { kamranTest } from '../support/kamran-guard'
import { placeKamranOrder } from '../support/kamran-order'
import { shirinGuardedTest } from '../support/shirin-guard'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// An account order's life against the dev backend (Plan 4 Task 8), in the `journeys` project only
// (playwright.config.ts): k.yazdi (ruling P4-R4: never sara), signed in by the `kamran` guard,
// which puts his cart back afterwards. An order of his left awaiting payment (placed through the
// BFF: support/kamran-order.ts) is found under «در انتظار پرداخت» in «سفارش‌های من» and opened;
// «پرداخت» opens the route choice through his uuid door and the dev bank refuses it (digest §11
// #3: no navigation, said in the sheet); «لغو سفارش» cancels it from its page (the API's order
// shown at once); «خرید دوباره» puts its line back in his cart and the toast leads to it. Whatever
// happens, the order is cancelled (the `kamran` guard's teardown, also after a timeout; already
// cancelled is fine). Per run: 1
// placement, 1 payment intent (refused), 1 cancellation, 1 reorder.
// Then «خرید دوباره» on a DELIVERED order (Task 10): shirin's (P4-R4: k.yazdi has none; never
// sara's), her first in «تحویل داده شده»: the toast, and the order's lines in her cart. A reorder
// writes only the cart: her cart (and address book) are put back exactly by the `shirin` guard
// (support/shirin-guard.ts), however the test ends. Per run: 1 reorder, the restore's cart writes.

kamranTest.describe.configure({ mode: 'serial' })

const toPersian = (digits: string) => digits.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/order\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)

kamranTest(
  'k.yazdi: an order awaiting payment, opened from his orders, refused by the dev bank, cancelled there, bought again',
  async ({ page, kamran }) => {
    const errors = watchErrors(page)
    const home = kamran.before.addresses[0]
    expect(home, 'k.yazdi has a saved address (the sample data)').toBeDefined()
    const order = await placeKamranOrder(kamran.request, home!.id)
    const code = order.order_code
    kamran.track(code)
    const shown = toPersian(code)

    // «سفارش‌های من», «در انتظار پرداخت»: his order, payable and cancellable.
    await page.goto('/account/orders/?group=awaiting_payment')
    const card = page.getByRole('article', { name: new RegExp(shown) })
    await expect(card.getByRole('button', { name: 'پرداخت' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'لغو سفارش' })).toBeVisible()
    await card.getByRole('link', { name: new RegExp(`سفارش ${shown}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/account/orders/${code}/$`))
    await expect(page.getByRole('heading', { level: 1, name: `سفارش ${shown}` })).toBeVisible()

    // «پرداخت»: the routes for what is owed online; the bank, refused by the dev backend.
    await page.getByRole('button', { name: 'پرداخت', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: /پرداخت سفارش/ })
    const routes = sheet.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
    const bank = routes.getByRole('radio', { name: 'درگاه بانکی', exact: true })
    await expect(bank).toBeEnabled()
    await bank.check({ force: true })
    const intent = page.waitForResponse(isIntent)
    await sheet.getByRole('button', { name: 'پرداخت سفارش' }).click()
    const refused = await intent
    expect([400, 503]).toContain(refused.status())
    expect(refused.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
    forgiveFailure(page, refused.url(), refused.status())
    await expect(sheet.getByRole('alert')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(`/account/orders/${code}/`)
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    // «لغو سفارش» from its page: the question starts on «بازگشت»; the API's order at once.
    await page.getByRole('button', { name: 'لغو سفارش' }).click()
    const dialog = page.getByRole('dialog', { name: 'لغو سفارش' })
    await expect(dialog.getByRole('button', { name: 'بازگشت' })).toBeFocused()
    await dialog.getByRole('textbox', { name: /دلیل لغو/ }).fill('آزمون خودکار سفارش‌ها')
    const cancelled = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/bff/order/${code}/cancel/`) &&
        response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'لغو سفارش' }).click()
    expect((await cancelled).status()).toBe(200)
    await expect(dialog).toBeHidden()
    await expect(page.locator('[data-status]')).toHaveText('لغو شده')
    await expect(page.getByRole('button', { name: 'لغو سفارش' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'پرداخت', exact: true })).toHaveCount(0)

    // «خرید دوباره» (any status): his order's line in the cart; the toast leads there.
    const answer = await cartWrite(
      page,
      { method: 'POST', path: 'cart/reorder/', label: 'reorder' },
      () => page.getByRole('button', { name: 'خرید دوباره' }).click(),
    )
    const result = ((await answer.json()) as { data: CartReorderResult }).data
    expect(result.added_lines).toBeGreaterThan(0)
    const toasts = page.getByRole('region', { name: /^اعلان‌ها/ })
    await expect(toasts).toContainText('از این سفارش به سبد خرید اضافه شد')
    await toasts.getByRole('link', { name: 'مشاهده\u{0654} سبد خرید' }).click()
    await expect(page).toHaveURL(/\/cart\/$/)
    await expect(page.getByRole('heading', { level: 1, name: /سبد خرید/ })).toBeVisible()
    expect(errors).toEqual([])
  },
)

shirinGuardedTest(
  'shirin: «خرید دوباره» on a delivered order fills her cart; the toast leads there',
  async ({ page, shirin }) => {
    const errors = watchErrors(page)
    await page.goto('/account/orders/?group=delivered')
    const card = page.getByRole('article').first()
    await expect(card).toBeVisible()
    await card.getByRole('heading', { level: 2 }).getByRole('link').click()
    await expect(page).toHaveURL(/\/account\/orders\/\d{10}\/$/)
    await expect(page.locator('[data-status]')).toHaveText('تکمیل شده')

    const answer = await cartWrite(
      page,
      { method: 'POST', path: 'cart/reorder/', label: 'reorder (delivered)' },
      () => page.getByRole('button', { name: 'خرید دوباره' }).click(),
    )
    const result = ((await answer.json()) as { data: CartReorderResult }).data
    expect(result.added_lines, 'its lines went into her cart').toBeGreaterThan(0)
    const toasts = page.getByRole('region', { name: /^اعلان‌ها/ })
    await expect(toasts).toContainText('از این سفارش به سبد خرید اضافه شد')
    await toasts.getByRole('link', { name: 'مشاهده\u{0654} سبد خرید' }).click()
    await expect(page).toHaveURL(/\/cart\/$/)
    // The cart page shows her cart as the API now has it: every line of it.
    const now = await shirin.request.get('/api/bff/cart/', {
      headers: { 'X-Requested-With': 'ff' },
    })
    const cart = ((await now.json()) as { data: Cart }).data
    expect(cart.lines.length).toBeGreaterThanOrEqual(result.added_lines)
    const lines = page.getByRole('region', { name: 'کالاهای سبد خرید' }).getByRole('listitem')
    await expect(lines).toHaveCount(cart.lines.length)
    expect(errors).toEqual([])
  },
)
