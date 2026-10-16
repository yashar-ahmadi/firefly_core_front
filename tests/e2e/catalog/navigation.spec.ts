import { expect, test } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'

// Client navigations show a progress bar along the top (there is no loading.tsx, R9).

/** A product page, as a document or as the RSC payload of a client navigation. */
const PRODUCT_PAGE = /\/product\/(?!list\/)[^/?]+\/(?:\?.*)?$/

test('a slow product page shows the progress bar from the click until it arrives', async ({
  page,
}) => {
  await page.goto('/product/list/')
  await shellHydrated(page)
  // Hold every product page (prefetches included) for two seconds.
  await page.route(PRODUCT_PAGE, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await route.continue().catch(() => undefined)
  })

  const link = page
    .getByRole('list', { name: 'صفحهٔ ۱' })
    .getByRole('article')
    .first()
    .getByRole('link')
    .first()
  const href = await link.getAttribute('href')
  expect(href).toMatch(/^\/product\/[^/]+\/$/)
  const bar = page.locator('[data-navigation-progress] [data-phase="loading"]')
  await expect(bar).toHaveCount(0)

  await link.click()
  await expect(bar).toBeVisible({ timeout: 1_000 })
  await expect(page.locator('main#main')).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('[data-navigation-progress]')).toHaveAttribute('aria-hidden', 'true')

  await expect(page).toHaveURL((url) => url.pathname === href, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(bar).toHaveCount(0)
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true')
})
