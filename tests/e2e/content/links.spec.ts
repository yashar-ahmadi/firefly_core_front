import { expect, test, type Page } from '@playwright/test'
import { watchErrors } from '../support/watch-errors'

// The linker, `/links/` (Plan 5 Task 4), against the dev backend's (content digest §8: the `cyan`
// theme, a gradient with white text on transparent buttons; no logo; four links, five socials).
// Its own minimal layout: no shop header or footer, but the root layout's skip link, `<main>`,
// the security headers and the operator's code (the proxy marks it a `page`). Read only.

const root = (page: Page) => page.locator('[data-linker]')

test.describe('the linker', () => {
  test('renders in its theme, without the shop’s shell', async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/links/')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-frame-options']).toBe('SAMEORIGIN')
    expect(response?.headers()['x-content-type-options']).toBe('nosniff')

    // The theme: the gradient on the root, the white text.
    const painted = await root(page).evaluate((element) => {
      const style = getComputedStyle(element)
      return { image: style.backgroundImage, repeat: style.backgroundRepeat, color: style.color }
    })
    expect(painted.image).toContain('linear-gradient')
    expect(painted.repeat).toBe('no-repeat')
    expect(painted.color).toBe('rgb(255, 255, 255)')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('فروشگاه فایرفلای')
    await expect(page.locator('[data-avatar-letter]')).toHaveText('ف')
    const socials = page.getByRole('list', { name: 'شبکه\u{200C}های اجتماعی' }).getByRole('link')
    await expect(socials).toHaveCount(5)
    await expect(socials.first()).toHaveAttribute('aria-label', 'instagram')
    const links = page.getByRole('list', { name: 'پیوندها' })
    await expect(links.getByRole('link', { name: /گوشی\u{200C}های پرچمدار/u })).toHaveAttribute(
      'href',
      '/product/list/flagship-phones/',
    )
    await expect(links.getByRole('link', { name: /ایمیل به پشتیبانی/ })).toHaveAttribute(
      'href',
      'mailto:support@firefly-core.ir',
    )
    await expect(links.getByRole('link', { name: /تماس با پشتیبانی/ })).toHaveAttribute(
      'href',
      'tel:+982191001234',
    )
    await expect(links.getByRole('heading', { level: 2, name: 'ساعت پاسخگویی' })).toBeVisible()
    // The footer line (inside <main>, so not a landmark of its own).
    await expect(root(page).locator('footer')).toHaveText('فروشگاه فایرفلای')

    // No shop shell; the root layout's skip link to the page's <main>.
    await expect(page.getByRole('banner')).toHaveCount(0)
    await expect(page.locator('main#main')).toHaveCount(1)
    await expect(page.locator('a[href="#main"]')).toHaveCount(1)
    // The operator's head snippet ran: the proxy marked the page.
    expect(
      await page.evaluate(() => Array.isArray((window as { dataLayer?: unknown }).dataLayer)),
    ).toBe(true)

    await expect(page).toHaveTitle('فروشگاه فایرفلای')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/links\/$/)
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('a focused link shows its ring in the theme’s text colour', async ({ page }) => {
    await page.goto('/links/')
    const first = page
      .getByRole('list', { name: 'شبکه\u{200C}های اجتماعی' })
      .getByRole('link')
      .first()
    await first.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    const ring = await first.evaluate((element) => {
      const style = getComputedStyle(element)
      return { style: style.outlineStyle, color: style.outlineColor, width: style.outlineWidth }
    })
    expect(ring).toEqual({ style: 'solid', color: 'rgb(255, 255, 255)', width: '2px' })
  })
})
