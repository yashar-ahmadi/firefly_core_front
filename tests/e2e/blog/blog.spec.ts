import { expect, test, type Page } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { watchErrors } from '../support/watch-errors'

// The blog home, its archive and its category pages (Plan 5 Task 1) against the dev backend's
// sample blog (19 posts, 12 a page; 7 categories). Read only, every project, as a guest. One
// search per project (the search results' «مشاهدهٔ همه», logged in the operator's report).
// A post's page: post.spec.ts.

const SEARCH = 'ای'

const main = (page: Page) => page.getByRole('main')
const archive = (page: Page) => main(page).getByRole('region', { name: /مطالب$/ })

test.describe('the blog', () => {
  test('the home shows its featured posts, the latest posts, the chips and the side column', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/blog/')
    expect(response?.status()).toBe(200)
    await expect(main(page).getByRole('heading', { level: 1, name: 'وبلاگ' })).toBeVisible()
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(
      main(page).getByRole('region', { name: 'مطالب ویژه' }).getByRole('article').first(),
    ).toBeVisible()
    await expect(archive(page).getByRole('article')).toHaveCount(12)
    const first = archive(page).getByRole('article').first()
    await expect(first.getByRole('heading', { level: 3 }).getByRole('link')).toHaveAttribute(
      'href',
      /^\/blog\/[^/]+\/$/,
    )
    await expect(first.getByRole('time')).toHaveText(/[۰-۹]{4}$/)
    const chips = main(page).getByRole('navigation', { name: 'دسته‌بندی‌های وبلاگ' })
    await expect(chips.getByRole('link', { name: 'راهنمای خرید' })).toHaveAttribute(
      'href',
      '/blog/category/buying-guide/',
    )
    await expect(main(page).getByRole('complementary', { name: 'ستون کناری وبلاگ' })).toBeVisible()
    await expect(page).toHaveTitle(/^وبلاگ \| /)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/blog\/$/)
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(jsonLd.map((text) => (JSON.parse(text) as { '@type': string })['@type'])).toEqual(
      expect.arrayContaining(['BreadcrumbList', 'Blog']),
    )
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('the pager goes to page 2, the archive alone; past the last page is a 404', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto('/blog/')
    await shellHydrated(page)
    await main(page)
      .getByRole('navigation', { name: 'صفحه‌بندی' })
      .getByRole('link', { name: 'صفحه بعدی' })
      .click()
    await expect(page).toHaveURL(/\/blog\/\?page=2$/)
    await expect(archive(page)).toHaveAccessibleName('همه\u{0654} مطالب')
    await expect(archive(page).getByRole('article')).toHaveCount(7)
    await expect(main(page).getByRole('region', { name: 'مطالب ویژه' })).toHaveCount(0)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/blog\/\?page=2$/)
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
    // Past the last page: a real 404 (the browser logs that status itself; it is the point here).
    const past = await page.goto('/blog/?page=9')
    expect(past?.status()).toBe(404)
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(/پیدا نشد/)
  })

  test('a category page lists its posts under its trail; an old path moves to its own', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/blog/category/mobile-blog/')
    // The API's path is `tech-news/mobile-blog`: one 308 to it.
    expect(response?.request().redirectedFrom()?.url()).toMatch(/\/blog\/category\/mobile-blog\/$/)
    await expect(page).toHaveURL(/\/blog\/category\/tech-news\/mobile-blog\/$/)
    expect(response?.status()).toBe(200)
    await expect(main(page).getByRole('heading', { level: 1, name: 'گوشی و موبایل' })).toBeVisible()
    const trail = main(page).getByRole('navigation', { name: 'مسیر صفحه' })
    await expect(trail.getByRole('link', { name: 'وبلاگ' })).toHaveAttribute('href', '/blog/')
    await expect(trail.getByRole('link', { name: 'اخبار فناوری' })).toHaveAttribute(
      'href',
      '/blog/category/tech-news/',
    )
    await expect(
      main(page).getByRole('region', { name: 'مطالب این دسته' }).getByRole('article').first(),
    ).toBeVisible()
    await expect(page).toHaveTitle('گوشی و موبایل | وبلاگ فایرفلای')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('an unknown category is a real 404', async ({ page }) => {
    const response = await page.goto('/blog/category/no-such-category-e2e/')
    expect(response?.status()).toBe(404)
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(/پیدا نشد/)
  })

  test('the search results’ «مشاهدهٔ همه» for posts opens the blog’s archive of the term', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto(`/search/?q=${encodeURIComponent(SEARCH)}`)
    await shellHydrated(page)
    const posts = main(page).getByRole('region', { name: /^مطالب وبلاگ/ })
    await posts.getByRole('link', { name: 'مشاهده\u{0654} همه\u{0654} مطالب وبلاگ' }).click()
    await expect(page).toHaveURL(
      (url) => url.pathname === '/blog/' && url.searchParams.get('search') === SEARCH,
    )
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(
      `نتایج جستجو برای «${SEARCH}»`,
    )
    await expect(main(page).getByRole('article').first()).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('a guest’s bookmark asks them to log in first, coming back to the blog', async ({
    page,
  }) => {
    await page.goto('/blog/')
    await shellHydrated(page)
    await archive(page).getByRole('button', { name: 'افزودن به لیست مطالعه' }).first().click()
    await expect(page).toHaveURL(
      (url) => url.pathname === '/login/' && url.searchParams.get('next') === '/blog/',
    )
  })
})
