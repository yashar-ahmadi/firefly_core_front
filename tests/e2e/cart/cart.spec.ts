import { expect, test, type Page } from '@playwright/test'
import { cartWrite } from '../support/cart-write'
import { shellHydrated } from '../support/hydrated'
import { watchErrors } from '../support/watch-errors'

// The cart page against the dev backend (Plan 4 Task 1), as a guest only: the cart is the
// browser context's own guest cart (the BFF's `ff_cart` cookie), never a demo account's. One
// test per project: add a product, then on `/cart/` the stepper up and down, a code the API
// refuses (its own words under the field), removal with «بازگردانی», and clearing the cart.
// Throttles: one `coupon/apply/` per project (the backend allows 20 a minute per IP), a few
// dozen anonymous requests (2000 an hour). Every write goes through `cartWrite`
// (support/cart-write.ts): the dev SQLite «database is locked» is retried once, logged.

/** A simple product (one variant, 10123) with stock to spare. */
const PRODUCT = { slug: 'nestle-coffee-gold', variant: 10123, name: 'قهوه فوری نستله گلد' }
const BFF = '/api/bff/'
const CONTINUE = 'ادامه\u{0654} خرید'
const EMPTY = 'سبد خرید شما خالی است'

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

const quantityIs = (quantity: number) => (data: unknown) =>
  (data as { quantity?: number } | null)?.quantity === quantity

/** Adds the product from its page (the buy box, or the phone's buy bar). */
async function addFromProductPage(page: Page): Promise<void> {
  await page.goto(`/product/${PRODUCT.slug}/`)
  await shellHydrated(page)
  // Phones buy from the bar at the bottom, wider screens from the buy box.
  const buy = page.getByRole('region', { name: isPhone(page) ? 'نوار خرید' : 'خرید', exact: true })
  const add = buy.getByRole('button', { name: 'افزودن به سبد خرید' })
  await cartWrite(page, { method: 'POST', path: 'cart/item/add/', label: 'add' }, () => add.click())
}

test('a guest’s cart page: stepper, a refused code, remove and undo, then clear', async ({
  page,
}) => {
  const errors = watchErrors(page)
  await addFromProductPage(page)

  await page.goto('/cart/')
  await expect(page).toHaveTitle(/^سبد خرید \|/)
  const lines = page.getByRole('region', { name: 'کالاهای سبد خرید' }).getByRole('listitem')
  await expect(lines).toHaveCount(1)
  const line = lines.first()
  await expect(line.getByRole('link', { name: PRODUCT.name })).toBeVisible()

  if (isPhone(page)) {
    // The cart's bar takes the bottom navigation's place.
    const bar = page.getByRole('region', { name: 'نوار سبد خرید' })
    await expect(bar.getByRole('link', { name: CONTINUE })).toHaveAttribute('href', '/checkout/')
    await expect(page.getByRole('navigation', { name: 'منوی پایین' })).toBeHidden()
  } else {
    // The summary's own «ادامهٔ خرید» (the bar is not shown from md).
    await expect(page.getByRole('link', { name: CONTINUE })).toHaveAttribute('href', '/checkout/')
  }

  // The stepper: one PUT with the final, absolute quantity after each change.
  const quantity = line.getByRole('group', { name: 'تعداد' })
  const lineWrite = { method: 'PUT', path: `cart/item/${PRODUCT.variant}/` } as const
  await cartWrite(page, { ...lineWrite, body: quantityIs(2), label: 'quantity 2' }, () =>
    line.getByRole('button', { name: 'افزایش تعداد' }).click(),
  )
  await expect(quantity).toContainText('۲')
  await cartWrite(page, { ...lineWrite, body: quantityIs(1), label: 'quantity 1' }, () =>
    line.getByRole('button', { name: 'کاهش تعداد' }).click(),
  )
  await expect(quantity).toContainText('۱')

  // A code the API refuses: its own detail, under the field, the code kept.
  const field = page.getByLabel('کد تخفیف دارید؟')
  await field.fill('NO-SUCH-CODE-E2E')
  const response = await cartWrite(
    page,
    { method: 'POST', path: 'cart/coupon/apply/', status: 400, label: 'a refused code' },
    () => page.getByRole('button', { name: 'اعمال کد' }).click(),
  )
  const { data } = (await response.json()) as { data: { errors: { detail: string }[] } }
  const detail = data.errors[0]!.detail
  await expect(page.getByRole('alert').filter({ hasText: detail })).toBeVisible()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveValue('NO-SUCH-CODE-E2E')

  // Removal, then «بازگردانی»: the same product and quantity back.
  await cartWrite(
    page,
    { method: 'DELETE', path: `cart/item/${PRODUCT.variant}/remove/`, label: 'remove' },
    () => line.getByRole('button', { name: 'حذف از سبد خرید' }).click(),
  )
  await expect(page.getByRole('heading', { name: EMPTY })).toBeVisible()
  const toast = page.locator('[data-sonner-toast]', {
    hasText: `«${PRODUCT.name}» از سبد خرید حذف شد.`,
  })
  await cartWrite(
    page,
    { method: 'POST', path: 'cart/item/add/', label: 'undo' },
    () => toast.getByRole('button', { name: 'بازگردانی' }).click(),
    // The toast's undo is spent once pressed: the product goes back from its own page.
    {
      retry: async () => {
        await addFromProductPage(page)
        await page.goto('/cart/')
      },
    },
  )
  await expect(lines).toHaveCount(1)
  await expect(lines.first().getByRole('link', { name: PRODUCT.name })).toBeVisible()

  // Clearing, after asking: the empty state, and on phones the bottom navigation back.
  const dialog = page.getByRole('dialog', { name: 'همه\u{0654} کالاها از سبد خرید حذف شوند؟' })
  const clear = async () => {
    await page.getByRole('button', { name: 'حذف همه' }).click()
    await dialog.getByRole('button', { name: 'حذف همه' }).click()
  }
  await cartWrite(page, { method: 'DELETE', path: 'cart/clear/', label: 'clear' }, clear)
  await expect(page.getByRole('heading', { name: EMPTY })).toBeVisible()
  await expect(page.getByRole('link', { name: 'وارد حساب شوید' })).toHaveAttribute(
    'href',
    '/login/?next=/cart/',
  )
  if (isPhone(page)) {
    await expect(page.getByRole('navigation', { name: 'منوی پایین' })).toBeVisible()
  }
  // The refused code's 400 is the browser's one console error here.
  expect(errors.filter((error) => !error.includes(`${BFF}cart/coupon/apply/`))).toEqual([])
})
