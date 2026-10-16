import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// The homepage against the dev backend's homepage builder (sample data): a 3-slide slider, the
// featured product carousel, category grids, banners, posts and a rich text.

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'
const FIRST_SLIDE = 'کمپین جمعه\u{0654} سیاه'
const FEATURED = 'پیشنهاد ویژه\u{0654} فایرفلای'

interface Section {
  id: number
  type: string
  title: string
}

async function sections(request: APIRequestContext): Promise<Section[]> {
  const res = await request.get(`${API_URL}/api/v1/homepage/`)
  expect(res.ok(), 'homepage from the backend').toBe(true)
  return ((await res.json()) as { data: { sections: Section[] } }).data.sections
}

/** Page errors and hydration complaints seen while the page runs. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) errors.push(message.text())
  })
  return errors
}

test.describe('home', () => {
  test('the first slide shows its title and hydrates cleanly', async ({ page, request }) => {
    const [first] = await sections(request)
    expect(first?.type, 'the sample homepage starts with the slider').toBe('slider')
    const errors = watchErrors(page)

    await page.goto('/')
    const slider = page.getByRole('region', { name: 'اسلایدر ویژه' })
    const slide = slider.getByRole('group', { name: '۱ از ۳' })
    await expect(slide.getByText(FIRST_SLIDE)).toBeVisible()
    await expect(slide.getByRole('link')).toHaveAttribute('href', '/blog/black-friday-guide/')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test.describe('server HTML', () => {
    // Before any script runs (dev pictures 404, and a failed picture is removed after hydration).
    test.use({ javaScriptEnabled: false })

    test("only the hero's first picture loads eagerly with high priority", async ({ page }) => {
      await page.goto('/')
      const slide = page.getByRole('group', { name: '۱ از ۳' })
      await expect(slide.locator('picture > img')).toHaveAttribute('fetchpriority', 'high')
      await expect(slide.locator('picture > img')).toHaveAttribute('loading', 'eager')
      await expect(page.locator('main img[fetchpriority="high"]')).toHaveCount(1)
      await expect(page.locator('main img[loading="eager"]')).toHaveCount(1)
      // The first slide has a mobile picture.
      await expect(slide.locator('picture > source')).toHaveAttribute('media', '(max-width: 767px)')
    })
  })

  test('the featured carousel shows product cards with a see-all header', async ({ page }) => {
    await page.goto('/')
    const heading = page.getByRole('heading', { level: 2, name: FEATURED })
    await expect(heading).toBeVisible()
    const carousel = page.getByRole('region', { name: FEATURED })
    await expect(carousel).toHaveAttribute('aria-roledescription', 'carousel')
    const cards = carousel.getByRole('article')
    expect(await cards.count()).toBeGreaterThan(0)
    await expect(cards.first()).toBeVisible()
    await expect(cards.first().getByRole('link')).toHaveAttribute('href', /^\/product\/[^/]+\/$/)

    // The manual carousel has no see-all; the phones carousel links to the operator's URL.
    await expect(heading.locator('xpath=following-sibling::a')).toHaveCount(0)
    const phones = page.getByRole('heading', { level: 2, name: 'گوشی موبایل' })
    await expect(phones.locator('xpath=following-sibling::a')).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
  })

  test('clicking a card opens its product page', async ({ page }) => {
    await page.goto('/')
    const link = page
      .getByRole('region', { name: FEATURED })
      .getByRole('article')
      .first()
      .getByRole('link')
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/product\/[^/]+\/$/)
    await link.click()
    // The product page itself comes with Plan 2 Task 7: only the URL is checked here.
    await expect(page).toHaveURL((url) => url.pathname === href)
  })

  test('category tiles link to their full path', async ({ page }) => {
    await page.goto('/')
    const grid = page.locator('section', {
      has: page.getByRole('heading', { name: 'دسته\u{200C}بندی\u{200C}های منتخب' }),
    })
    await expect(grid.getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
  })

  test('the page title and canonical come from the homepage SEO fields', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('فایرفلای | فروشگاه اینترنتی کالای اصل')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'فایرفلای | فروشگاه اینترنتی کالای اصل',
    )
  })

  test('nothing scrolls sideways', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('load')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
