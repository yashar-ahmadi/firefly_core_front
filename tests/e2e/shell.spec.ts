import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { htmlToText } from '@/lib/html/to-text'

// The shop shell against the dev backend (sample data): logo, mega-menu (lg+), categories drawer
// (md to lg), bottom navigation and category browser (phones) and the announcement bar.

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'
const CATEGORIES = 'دسته‌بندی‌ها'

interface Settings {
  name: string
  announcement: string | null
}

async function settings(request: APIRequestContext): Promise<Settings> {
  const res = await request.get(`${API_URL}/api/v1/global/settings/`)
  expect(res.ok(), 'settings from the backend').toBe(true)
  return ((await res.json()) as { data: Settings }).data
}

function width(page: Page): number {
  return page.viewportSize()?.width ?? 0
}

test.describe('shell', () => {
  test('the header shows the store logo named after the store and hydrates cleanly', async ({
    page,
    request,
  }) => {
    const { name } = await settings(request)
    expect(name).toBe('فایرفلای')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')
    const header = page.getByRole('banner')
    // An <img alt=name>, or the wordmark named the same when the file is missing (dev media).
    await expect(header.getByRole('img', { name })).toBeVisible()
    await expect(header.getByRole('link', { name })).toHaveAttribute('href', '/')
    await expect(header.getByRole('search').first()).toBeAttached()
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('desktop: the mega-menu opens on hover and shows the main menu', async ({ page }) => {
    test.skip(width(page) < 1024, 'the mega-menu is shown from lg up')
    await page.goto('/')
    const trigger = page.getByRole('button', { name: CATEGORIES })
    await trigger.hover()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const roots = page.getByRole('list', { name: CATEGORIES })
    await expect(roots.getByText('کالای دیجیتال')).toBeVisible()
    await expect(page.getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )

    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(roots).toBeHidden()

    // Moving the pointer away onto the dimmed page closes it too.
    await page.getByRole('banner').getByRole('img').first().hover()
    await trigger.hover()
    await expect(roots).toBeVisible()
    const viewport = page.viewportSize() ?? { width: 0, height: 0 }
    await page.mouse.move(viewport.width / 2, viewport.height - 40, { steps: 5 })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  test('phones: the bottom navigation is shown and its categories tab opens the browser', async ({
    page,
  }) => {
    test.skip(width(page) >= 768, 'the bottom navigation is for phones')
    await page.goto('/')
    const bottomNav = page.getByRole('navigation', { name: 'منوی پایین' })
    await expect(bottomNav).toBeVisible()
    await expect(bottomNav.getByRole('link', { name: 'خانه' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await bottomNav.getByRole('link', { name: CATEGORIES }).click()
    await expect(page).toHaveURL(/\/categories\/$/)
    await expect(bottomNav.getByRole('link', { name: CATEGORIES })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const roots = page.getByRole('tablist', { name: CATEGORIES })
    await expect(roots.getByRole('tab', { name: 'کالای دیجیتال' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(
      page.getByRole('tabpanel').getByRole('link', { name: 'گوشی موبایل' }),
    ).toHaveAttribute('href', '/product-category/digital/mobile-phone/')

    await roots.getByRole('tab', { name: 'لوازم خانگی' }).click()
    await expect(
      page.getByRole('tabpanel').getByRole('link', { name: 'یخچال و فریزر' }),
    ).toBeVisible()
  })

  test('wider screens: no bottom navigation', async ({ page }) => {
    test.skip(width(page) < 768, 'phones have the bottom navigation')
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'منوی پایین' })).toBeHidden()
  })

  test('the announcement from the settings is shown and stays dismissed', async ({
    page,
    request,
  }) => {
    const { announcement } = await settings(request)
    test.skip(!announcement?.trim(), 'the backend has no announcement')
    // The bar shows the operator HTML as text, exactly as htmlToText makes it.
    const text = htmlToText(announcement)

    await page.goto('/')
    await expect(page.getByText(text)).toBeVisible()
    await page.getByRole('button', { name: 'بستن اطلاعیه' }).click()
    await expect(page.getByText(text)).toBeHidden()

    // After a reload it stays hidden even before React hydrates (the scripts are held back),
    // so the page does not jump.
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
      await held
      await route.continue()
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByText(text)).toBeHidden()

    release()
    await page.waitForLoadState('load')
    await expect(page.getByText(text)).toBeHidden()
    expect(errors).toEqual([])
  })
})

test.describe('tablet portrait', () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  test('the categories button opens a drawer with the menu as an accordion', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'runs once, in the tablet project')
    await page.goto('/')
    await page.getByRole('button', { name: CATEGORIES }).click()
    const drawer = page.getByRole('dialog', { name: CATEGORIES })
    await expect(drawer).toBeVisible()

    await drawer.getByRole('button', { name: 'کالای دیجیتال' }).click()
    await expect(drawer.getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  })
})
