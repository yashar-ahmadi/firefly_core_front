import { expect, test, type Page } from '@playwright/test'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { shellHydrated } from '../support/hydrated'
import { MARKERS, readCart } from '../support/sara-data'
import { guardedTest } from '../support/sara-guard'
import { logInWithForm, logOut, SESSION_COOKIES } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// Logging in through the form against the dev backend (Plan 3 Task 10), in the `journeys`
// project only (playwright.config.ts): a desktop, one test at a time, after the other projects.
// Each login here is one `auth_attempt` (support/session.ts counts them). The guest's cart line
// that the login merges into sara's cart is taken out again by the `sara` guard (support/
// sara-guard.ts), her lines left as they were, however the test ends.

test.describe.configure({ mode: 'serial' })

const LOGIN = '/api/bff/account/auth/login/'
const BFF = { 'X-Requested-With': 'ff' }
/** A product not in sara's cart (the guard took out any leftover): the guest's line. */
const GUEST_PRODUCT = MARKERS.cartProduct
const ADD = 'افزودن به سبد خرید'

const digits = (n: number) => new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(n)
const cartLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^سبد خرید/ })
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A cleanup step that failed: said, never in the way of the next one. */
const warn = (step: string) => (error: unknown) => console.warn(`[auth.spec] ${step}:`, error)

/** Whether `page`'s context holds a session (the refresh cookie). */
async function signedIn(page: Page): Promise<boolean> {
  return (await page.context().cookies()).some(({ name }) => name === SESSION_COOKIES[1])
}

test('a wrong password: the API’s own words under the field, and no session', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/login/')
  const answer = page.waitForResponse(
    (response) => response.url().endsWith(LOGIN) && response.request().method() === 'POST',
  )
  await logInWithForm(page, 'Not-Saras-Password-1404')
  const response = await answer
  const body = (await response.json()) as { data: { errors: { code: string; detail: string }[] } }
  expect(response.status()).toBe(401)
  const [{ code, detail }] = body.data.errors as [{ code: string; detail: string }]
  expect(code).toBe('auth_invalid_credentials')
  const password = page.getByLabel('رمز عبور', { exact: true })
  await expect(page.getByText(detail, { exact: true })).toBeVisible()
  await expect(password).toHaveAccessibleDescription(new RegExp(escape(detail)))
  await expect(password).toBeFocused()
  await expect(page).toHaveURL(/\/login\/$/)
  expect(await signedIn(page)).toBe(false)
  // The refused POST is the browser's one console error here.
  expect(errors.filter((error) => !error.includes(LOGIN))).toEqual([])
})

guardedTest(
  'a guest’s cart line survives the login (merge), and ?next=//evil.com lands on /account/',
  async ({ page, sara, baseURL }) => {
    const errors = watchErrors(page)
    const origin = baseURL ?? 'http://localhost:3000'
    const product = await page.request.get(`/api/bff/product/detail/${GUEST_PRODUCT}/`, {
      headers: BFF,
    })
    const variant = ((await product.json()) as { data: ProductDetail }).data.default_variant_id
    expect(sara.before.cart.map((line) => line.variant)).not.toContain(variant)
    try {
      await page.goto(`/product/${GUEST_PRODUCT}/`)
      await shellHydrated(page)
      await expect(cartLink(page)).toHaveAccessibleName('سبد خرید')
      await page
        .getByRole('region', { name: 'خرید', exact: true })
        .getByRole('button', { name: ADD })
        .click()
      await expect(cartLink(page)).toHaveAccessibleName(`سبد خرید، ${digits(1)} کالا`)

      // A `next` off the site is never followed: the login lands on the account.
      await page.goto('/login/?next=//evil.com')
      const merged = page.waitForResponse((response) =>
        response.url().endsWith('/api/bff/cart/merge/'),
      )
      await logInWithForm(page)
      expect((await merged).ok(), 'cart/merge/').toBe(true)
      await expect(page).toHaveURL(`${origin}/account/`)
      await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'سفارش‌های من' })).toBeVisible()
      // Merged: sara's lines and the guest's one, in the badge and in her cart.
      const count = sara.before.cart.reduce((sum, line) => sum + line.quantity, 1)
      await expect(cartLink(page)).toHaveAccessibleName(`سبد خرید، ${digits(count)} کالا`)
      expect(await readCart(sara.request)).toContainEqual({ variant, quantity: 1 })
      expect(errors).toEqual([])
    } finally {
      // Each on its own (sara's cart itself is the guard's): this page's session is logged out;
      // never signed in, the guest's line gives its stock hold back.
      const live = await signedIn(page).catch(() => false)
      if (live) await logOut(page.context(), origin).catch(warn('logout'))
      else
        await page.request
          .delete(`/api/bff/cart/item/${variant}/remove/`, { headers: BFF })
          .catch(warn('the guest line'))
    }
  },
)
