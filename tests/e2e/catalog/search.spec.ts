import { expect, test, type Locator, type Page } from '@playwright/test'
import { watchErrors } from '../support/watch-errors'

// Search (spec §8.5) against the dev backend's sample data. Every call to the API's `search/`
// is logged in the operator's report: these tests run three searches per project (one with
// results, one with none, one refused); suggestions and `/search/` without a term log nothing.

const SAMSUNG = 'سامسونگ'
const NONSENSE = 'zzqxwv'
const MD = 768

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < MD

/** Once hydrated, the phone field opens the overlay (its marker is there at every width). */
async function hydrated(page: Page) {
  await expect(page.locator('header input[name="q"][aria-haspopup="dialog"]')).toHaveCount(1)
}

/** The header's search combobox: in the phone overlay (opened by a tap), or the desktop box. */
async function searchField(page: Page): Promise<Locator> {
  await hydrated(page)
  if (isPhone(page)) {
    await page.getByRole('banner').getByRole('searchbox', { name: 'جستجو' }).click()
    return page.getByRole('dialog', { name: 'جستجو' }).getByRole('combobox', { name: 'جستجو' })
  }
  return page.getByRole('banner').getByRole('combobox', { name: 'جستجو' })
}

test.describe('search', () => {
  test('suggests as you type, and Enter shows the results page with products', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    const field = await searchField(page)
    await field.pressSequentially(SAMSUNG, { delay: 30 })

    const listbox = page.getByRole('listbox', { name: 'پیشنهادهای جستجو' })
    await expect(listbox).toBeVisible()
    await expect(field).toHaveAttribute('aria-expanded', 'true')
    await expect(listbox.getByRole('option', { name: SAMSUNG, exact: true })).toBeVisible()
    await expect(
      listbox.getByRole('group', { name: 'محصولات' }).getByRole('option'),
    ).not.toHaveCount(0)
    // The typed term is marked in the suggestions.
    await expect(listbox.locator('mark').first()).toHaveText(SAMSUNG)

    await field.press('Enter')
    await expect(page).toHaveURL(
      (url) => url.pathname === '/search/' && url.searchParams.get('q') === SAMSUNG,
    )
    const main = page.getByRole('main')
    await expect(
      main.getByRole('heading', { level: 1, name: `نتایج جستجو برای «${SAMSUNG}»` }),
    ).toBeVisible()
    const products = main.getByRole('region', { name: /^محصولات/ })
    await expect(products.getByRole('article').first()).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(`^جستجو: ${SAMSUNG}`))
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('on phones, a tap on the header field opens the full-screen search', async ({ page }) => {
    test.skip(!isPhone(page), 'the overlay is for phones (below md)')
    const errors = watchErrors(page)
    await page.goto('/')
    await hydrated(page)
    const trigger = page.getByRole('banner').getByRole('searchbox', { name: 'جستجو' })
    await trigger.tap()
    const dialog = page.getByRole('dialog', { name: 'جستجو' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: 'جستجو' })).toBeFocused()
    const box = await dialog.boundingBox()
    expect(box).toMatchObject({ x: 0, y: 0, width: page.viewportSize()!.width })

    await dialog.getByRole('button', { name: 'بازگشت' }).click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    expect(errors).toEqual([])
  })

  test('/search/ without a term shows the field and the tips', async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/search/')
    expect(response?.status()).toBe(200)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1, name: 'جستجو' })).toBeVisible()
    await expect(
      main.getByRole('heading', { name: 'چه چیزی را جستجو می\u{200C}کنید؟' }),
    ).toBeVisible()
    await expect(main.getByRole('list', { name: 'راهنمای جستجو' })).toBeVisible()
    await expect(main.getByRole('search')).toHaveAttribute('action', '/search/')
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('says when nothing is found, and offers the main categories', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(`/search/?q=${NONSENSE}`)
    const main = page.getByRole('main')
    await expect(
      main.getByRole('heading', { name: `نتیجه\u{200C}ای برای «${NONSENSE}» پیدا نشد` }),
    ).toBeVisible()
    const categories = main.getByRole('list', { name: 'دسته\u{200C}بندی\u{200C}های اصلی' })
    await expect(categories.getByRole('link').first()).toHaveAttribute(
      'href',
      /^\/product-category\//,
    )
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('explains a term too short to search, without an error page', async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto(`/search/?q=${encodeURIComponent('س')}`)
    expect(response?.status()).toBe(200)
    const main = page.getByRole('main')
    await expect(
      main.getByRole('heading', { name: 'این عبارت را نمی\u{200C}توان جستجو کرد' }),
    ).toBeVisible()
    await expect(main.getByText(/دست\u{200C}کم ۲ نویسه/u)).toBeVisible()
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })
})
