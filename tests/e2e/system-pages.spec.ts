import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { formatIranMobile } from '@/lib/format/phone'
import { htmlToText } from '@/lib/html/to-text'

// The footer (against the dev backend's sample settings and footer menu) and the 404 page.

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'
const NOT_FOUND = 'صفحه‌ای که دنبالش بودید پیدا نشد'

interface Settings {
  phone: string | null
  copyright: string | null
}

async function settings(request: APIRequestContext): Promise<Settings> {
  const res = await request.get(`${API_URL}/api/v1/global/settings/`)
  expect(res.ok(), 'settings from the backend').toBe(true)
  return ((await res.json()) as { data: Settings }).data
}

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 768
}

test.describe('system pages', () => {
  test('an unknown URL answers 404 with the not-found page inside the shop chrome', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    const response = await page.goto('/this-does-not-exist/')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND })).toBeVisible()
    await expect(page).toHaveTitle(/^صفحه پیدا نشد \| /)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)

    // The header and footer are there, and the page offers a way on.
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeAttached()
    const main = page.getByRole('main')
    await expect(main.getByRole('search')).toHaveAttribute('action', '/search/')
    await expect(main.getByRole('link', { name: 'صفحه\u{0654} اصلی' })).toHaveAttribute('href', '/')
    await expect(main.getByRole('link', { name: 'دسته‌بندی‌ها', exact: true })).toHaveAttribute(
      'href',
      '/categories/',
    )
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('the footer shows the footer menu, phone and copyright from the backend', async ({
    page,
    request,
  }) => {
    const { phone, copyright } = await settings(request)
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    const menu = footer.getByRole('navigation', { name: 'پیوندهای پایین صفحه' })

    // Phones fold the columns into disclosures: open it first (its summary holds the heading).
    if (isPhone(page)) {
      await menu.locator('summary', { hasText: 'لینک‌های مفید' }).click()
    }
    const terms = menu.getByRole('link', { name: 'قوانین و مقررات' })
    await expect(terms).toBeVisible()
    await expect(terms).toHaveAttribute('href', '/page/terms/')

    if (phone) {
      const tel = footer.getByRole('link', { name: formatIranMobile(phone) })
      await expect(tel).toHaveAttribute('href', `tel:${phone}`)
      await expect(tel).toBeVisible()
    }
    if (copyright) await expect(footer.getByText(htmlToText(copyright))).toBeVisible()
  })

  test('«بازگشت به بالا» brings the visitor back to the top', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await page.getByRole('contentinfo').getByRole('button', { name: 'بازگشت به بالا' }).click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })
})
