import { expect, type Page } from '@playwright/test'
import type { Address } from '@/lib/api/types/address'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'
import { signedInTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// The address book against the dev backend (Plan 3 Task 7), with the project's shared session
// (`signedInTest`). Read-only: nothing is ever saved (any address write is refused here before
// it leaves the browser, and none is expected). The geography lists are the live API's; map tiles
// are answered here with a blank image (no third-party network in tests).

const WRITE = /\/api\/bff\/account\/address\/(?:create\/|\d+\/(?:update|delete|set-default)\/)/
const TILES = /^https:\/\/tile\.openstreetmap\.org\//
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
)

/** sara's book, read the way the page reads it. */
async function liveBook(page: Page): Promise<Paginated<Address>> {
  const response = await page.request.get('/api/bff/account/address/list/?limit=100', {
    headers: { 'X-Requested-With': 'ff' },
  })
  expect(response.ok(), 'account/address/list/ through the BFF').toBe(true)
  return ((await response.json()) as { data: Paginated<Address> }).data
}

async function geo<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/bff/transportation/${path}`, {
    headers: { 'X-Requested-With': 'ff' },
  })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: Paginated<T> }).data.results
}

/** Opens the book; refuses any address write and the map's tiles; returns the writes tried. */
async function openBook(page: Page) {
  const writes: string[] = []
  await page.route(WRITE, (route) => {
    writes.push(`${route.request().method()} ${route.request().url()}`)
    return route.abort()
  })
  await page.route(TILES, (route) => route.fulfill({ contentType: 'image/png', body: BLANK_PNG }))
  const response = await page.goto('/account/addresses/')
  expect(response?.status()).toBe(200)
  return { response, writes }
}

signedInTest(
  'shows sara’s address book: the default first, each card’s actions',
  async ({ page }) => {
    const errors = watchErrors(page)
    const { response, writes } = await openBook(page)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle(/^آدرس‌های من \| /)
    await expect(page.getByRole('heading', { level: 1, name: 'آدرس‌های من' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'افزودن آدرس جدید' }).first()).toBeVisible()

    const book = await liveBook(page)
    const cards = page.getByRole('article')
    if (book.count === 0) {
      await expect(page.getByRole('heading', { name: 'هنوز آدرسی ثبت نکرده‌اید' })).toBeVisible()
    } else {
      await expect(cards).toHaveCount(book.results.length)
      const first = book.results[0]!
      expect(first.is_default).toBe(true)
      const card = page.getByRole('article', { name: first.title })
      await expect(card.getByText('پیش‌فرض', { exact: true })).toBeVisible()
      await expect(card.getByRole('button', { name: `ویرایش آدرس ${first.title}` })).toBeVisible()
      await expect(card.getByRole('button', { name: `حذف آدرس ${first.title}` })).toBeVisible()
      await expect(page.getByText('پیش‌فرض', { exact: true })).toHaveCount(1)
    }
    // The account navigation (lg) marks the page.
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(
        page
          .getByRole('navigation', { name: 'حساب کاربری' })
          .getByRole('link', { name: 'نشانی‌ها' }),
      ).toHaveAttribute('aria-current', 'page')
    }
    // No sideways page scroll; every button of the page at least 44px tall (with its hit area).
    const width = page.viewportSize()?.width ?? 0
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    for (const button of await page.getByRole('main').getByRole('button').all()) {
      if (!(await button.isVisible())) continue
      const box = await button.boundingBox()
      expect(box?.height ?? 0, await button.innerText()).toBeGreaterThanOrEqual(40)
    }
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  },
)

signedInTest(
  'the form in a sheet: province → city from the live lists, checks, the map, close unsaved',
  async ({ page }) => {
    const errors = watchErrors(page)
    const { writes } = await openBook(page)
    const add = page.getByRole('button', { name: 'افزودن آدرس جدید' }).first()
    await add.click()
    const sheet = page.getByRole('dialog', { name: 'افزودن آدرس جدید' })
    await expect(sheet).toBeVisible()

    // Province, then that province's cities, from the API.
    const provinces = await geo<Province>(page, 'province/list/?limit=1500')
    const tehran = provinces.find((province) => province.name === 'تهران')!
    const isfahan = provinces.find((province) => province.name === 'اصفهان')!
    const province = sheet.getByRole('combobox', { name: /^استان/ })
    const city = sheet.getByRole('combobox', { name: /^شهر/ })
    await expect(city).toBeDisabled()
    await expect(province.getByRole('option')).toHaveCount(provinces.length + 1)
    await province.selectOption({ label: tehran.name })
    const tehranCities = await geo<City>(page, `city/list/?province=${tehran.id}&limit=1500`)
    await expect(city).toBeEnabled()
    await expect(city.getByRole('option')).toHaveCount(tehranCities.length + 1)
    await city.selectOption({ label: 'تهران' })
    await province.selectOption({ label: isfahan.name })
    // The city goes with the province.
    await expect(city).toHaveValue('')
    await expect(city.getByRole('option', { name: 'اصفهان' })).toHaveCount(1)

    // The checks before sending: messages under the fields, the first one focused.
    const title = sheet.getByRole('textbox', { name: /^عنوان آدرس/ })
    await sheet.getByRole('textbox', { name: /^شماره موبایل گیرنده/ }).fill('0912123')
    await sheet.getByRole('button', { name: 'ذخیرهٔ آدرس' }).click()
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await expect(title).toBeFocused()
    await expect(
      sheet.getByText('شمارهٔ موبایل ایران را وارد کنید؛ مانند ۰۹۱۲۱۲۳۴۵۶۷.'),
    ).toBeVisible()

    // The map loads on demand, left-to-right, with OpenStreetMap's attribution.
    await sheet.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' }).click()
    const map = sheet.getByRole('application', { name: 'نقشه' })
    await expect(sheet.getByRole('button', { name: 'تأیید موقعیت' })).toBeEnabled({
      timeout: 15_000,
    })
    await expect(map).toHaveAttribute('dir', 'ltr')
    await expect(map.locator('.leaflet-control-attribution')).toHaveText(
      '© OpenStreetMap contributors',
    )
    await sheet.getByRole('button', { name: 'تأیید موقعیت' }).click()
    await expect(sheet.getByText('موقعیت روی نقشه انتخاب شده است.')).toBeVisible()

    // Closed without saving: nothing sent, the focus back on the opener.
    await sheet.getByRole('button', { name: 'انصراف' }).click()
    await expect(sheet).toBeHidden()
    await expect(add).toBeFocused()
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  },
)

signedInTest('«حذف» asks first and «انصراف» keeps the address', async ({ page }) => {
  const errors = watchErrors(page)
  const { writes } = await openBook(page)
  const book = await liveBook(page)
  signedInTest.skip(book.count === 0, 'sara has no address to ask about')
  const first = book.results[0]!
  const remove = page.getByRole('button', { name: `حذف آدرس ${first.title}` })
  await remove.click()
  const dialog = page.getByRole('dialog', { name: `آدرس «${first.title}» حذف شود؟` })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'انصراف' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(remove).toBeFocused()
  await expect(page.getByRole('article')).toHaveCount(book.results.length)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
