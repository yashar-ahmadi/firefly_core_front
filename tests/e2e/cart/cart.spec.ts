import { expect, test, type Page, type Response } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { watchErrors } from '../support/watch-errors'

// The cart page against the dev backend (Plan 4 Task 1), as a guest only: the cart is the
// browser context's own guest cart (the BFF's `ff_cart` cookie), never a demo account's. One
// test per project: add a product, then on `/cart/` the stepper up and down, a code the API
// refuses (its own words under the field), removal with «بازگردانی», and clearing the cart.
// Throttles: one `coupon/apply/` per project (the backend allows 20 a minute per IP), a few
// dozen anonymous requests (2000 an hour).

// The dev backend runs on SQLite: two projects writing carts at the same moment can meet
// «database is locked» (a 500, seen in its log during this spec's first runs). One retry, in a
// fresh context (a new guest cart); a write that fails says what the BFF answered.
test.describe.configure({ retries: 1 })

/** A simple product (one variant, 10123) with stock to spare. */
const PRODUCT = { slug: 'nestle-coffee-gold', variant: 10123, name: 'قهوه فوری نستله گلد' }
const BFF = '/api/bff/'
const CONTINUE = 'ادامه\u{0654} خرید'
const EMPTY = 'سبد خرید شما خالی است'

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

/** The BFF's answer to `method path` (an API path, e.g. `cart/item/add/`). */
function answer(page: Page, method: string, path: string, body?: (data: unknown) => boolean) {
  return page.waitForResponse((response: Response) => {
    const request = response.request()
    if (request.method() !== method || !response.url().endsWith(`${BFF}${path}`)) return false
    return body ? body(request.postDataJSON()) : true
  })
}

/** The write went through; else the failure says what the BFF answered. */
async function expectOk(response: Promise<Response>, label: string): Promise<void> {
  const settled = await response
  const said = settled.ok() ? '' : ` ${settled.status()} ${await settled.text()}`
  expect(settled.ok(), `${label}${said}`).toBe(true)
}

const quantityIs = (quantity: number) => (data: unknown) =>
  (data as { quantity?: number } | null)?.quantity === quantity

test('a guest’s cart page: stepper, a refused code, remove and undo, then clear', async ({
  page,
}) => {
  const errors = watchErrors(page)
  await page.goto(`/product/${PRODUCT.slug}/`)
  await shellHydrated(page)
  // Phones buy from the bar at the bottom, wider screens from the buy box.
  const buy = page.getByRole('region', { name: isPhone(page) ? 'نوار خرید' : 'خرید', exact: true })
  const added = answer(page, 'POST', 'cart/item/add/')
  await buy.getByRole('button', { name: 'افزودن به سبد خرید' }).click()
  await expectOk(added, 'cart/item/add/')

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
  const up = answer(page, 'PUT', `cart/item/${PRODUCT.variant}/`, quantityIs(2))
  await line.getByRole('button', { name: 'افزایش تعداد' }).click()
  await expectOk(up, 'quantity 2')
  await expect(quantity).toContainText('۲')
  const down = answer(page, 'PUT', `cart/item/${PRODUCT.variant}/`, quantityIs(1))
  await line.getByRole('button', { name: 'کاهش تعداد' }).click()
  await expectOk(down, 'quantity 1')
  await expect(quantity).toContainText('۱')

  // A code the API refuses: its own detail, under the field, the code kept.
  const field = page.getByLabel('کد تخفیف دارید؟')
  await field.fill('NO-SUCH-CODE-E2E')
  const refused = answer(page, 'POST', 'cart/coupon/apply/')
  await page.getByRole('button', { name: 'اعمال کد' }).click()
  const response = await refused
  expect(response.status()).toBe(400)
  const { data } = (await response.json()) as { data: { errors: { detail: string }[] } }
  const detail = data.errors[0]!.detail
  await expect(page.getByRole('alert').filter({ hasText: detail })).toBeVisible()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveValue('NO-SUCH-CODE-E2E')

  // Removal, then «بازگردانی»: the same product and quantity back.
  const removed = answer(page, 'DELETE', `cart/item/${PRODUCT.variant}/remove/`)
  await line.getByRole('button', { name: 'حذف از سبد خرید' }).click()
  await expectOk(removed, 'remove')
  await expect(page.getByRole('heading', { name: EMPTY })).toBeVisible()
  const toast = page.locator('[data-sonner-toast]', {
    hasText: `«${PRODUCT.name}» از سبد خرید حذف شد.`,
  })
  const readded = answer(page, 'POST', 'cart/item/add/')
  await toast.getByRole('button', { name: 'بازگردانی' }).click()
  await expectOk(readded, 'undo')
  await expect(lines).toHaveCount(1)
  await expect(lines.first().getByRole('link', { name: PRODUCT.name })).toBeVisible()

  // Clearing, after asking: the empty state, and on phones the bottom navigation back.
  await page.getByRole('button', { name: 'حذف همه' }).click()
  const dialog = page.getByRole('dialog', { name: 'همه\u{0654} کالاها از سبد خرید حذف شوند؟' })
  const cleared = answer(page, 'DELETE', 'cart/clear/')
  await dialog.getByRole('button', { name: 'حذف همه' }).click()
  await expectOk(cleared, 'cart/clear/')
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
