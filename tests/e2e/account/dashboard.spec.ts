import { expect, test } from '@playwright/test'
import { workerInControl } from '../support/pwa'
import { signedInTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// The account dashboard against the dev backend (Plan 3 Task 5). Read-only with a session: it
// uses the project's shared session (`signedInTest`, one login per project), and never logs it
// out (the «خروج» row is only looked at). The guest check needs no session.

const ACCOUNT_NAV = 'حساب کاربری'
/** Persian digits, as every badge shows them. */
const COUNT = '[۰-۹٬]+'

test('a guest is sent to login, with the page and its query as next', async ({ request }) => {
  const dashboard = await request.get('/account/', { maxRedirects: 0 })
  expect(dashboard.status()).toBe(307)
  expect(dashboard.headers().location).toBe('/login/?next=/account/')
  expect(dashboard.headers()['set-cookie']).toBeUndefined()

  const orders = await request.get('/account/orders/?group=delivered', { maxRedirects: 0 })
  expect(orders.status()).toBe(307)
  expect(orders.headers().location).toBe('/login/?next=/account/orders/%3Fgroup%3Ddelivered')
})

// `@worker`: also run on the PWA server with the worker in control (the `pwa-journeys` project).
signedInTest(
  'greets sara, shows her order groups and the account pages',
  { tag: '@worker' },
  async ({ page }, testInfo) => {
    await workerInControl(page, testInfo)
    const errors = watchErrors(page)
    const response = await page.goto('/account/')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

    await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
    const strip = page.getByRole('region', { name: 'سفارش‌های من' })
    await expect(strip).toBeVisible()
    const groups = strip.getByRole('link', { name: new RegExp(`${COUNT} سفارش$`) })
    await expect(groups).toHaveCount(5)
    await expect(groups.first()).toHaveAttribute('href', '/account/orders/?group=awaiting_payment')
    await expect(groups.first()).toContainText('در انتظار پرداخت')
    // Every label whole, and no sideways page scroll (on phones the strip scrolls inside itself).
    for (const label of await groups.locator('[data-group-label]').all()) {
      expect(await label.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
    }
    const width = page.viewportSize()?.width ?? 0
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )

    // One account navigation on screen: the side column from lg, the dashboard's hub below.
    const nav = page.getByRole('navigation', { name: ACCOUNT_NAV })
    await expect(nav).toHaveCount(1)
    const orders = nav.getByRole('link', { name: new RegExp(`^سفارش‌ها\\s*،\\s*${COUNT} سفارش$`) })
    await expect(orders).toBeVisible()
    await expect(nav.getByRole('button', { name: 'خروج' })).toBeVisible()
    const wide = (page.viewportSize()?.width ?? 0) >= 1024
    const dashboard = nav.getByRole('link', { name: /^پیشخوان/ })
    // The side column marks the page; the hub is the dashboard, so it has no row for it.
    if (wide) await expect(dashboard).toHaveAttribute('aria-current', 'page')
    else await expect(dashboard).toHaveCount(0)
    const height = (await orders.boundingBox())?.height ?? 0
    expect(height).toBeGreaterThanOrEqual(wide ? 44 : 56)

    await expect(
      page.getByRole('region', { name: 'آخرین خریدها' }).getByRole('article'),
    ).toHaveCount(4)
    expect(errors).toEqual([])
  },
)

signedInTest('opens the reading list from the navigation and comes back', async ({ page }) => {
  // Read only: her list (or the empty state), never a write.
  const errors = watchErrors(page)
  await page.goto('/account/')
  const nav = page.getByRole('navigation', { name: ACCOUNT_NAV })
  await nav.getByRole('link', { name: /^لیست مطالعه/ }).click()
  await expect(page).toHaveURL(/\/account\/reading-list\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'لیست مطالعه' })).toBeVisible()
  await expect(
    page.getByRole('article').first().or(page.getByText('هنوز مطلبی در لیست مطالعه ندارید')),
  ).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/account\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
  expect(errors).toEqual([])
})
