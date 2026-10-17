import { expect, type Page } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { Province } from '@/lib/api/types/geo'
import { shellHydrated } from '../support/hydrated'
import { MARKERS, readWishlist } from '../support/sara-data'
import { signedInGuardedTest as test } from '../support/sara-guard'
import { watchErrors } from '../support/watch-errors'

// Live writes on sara's account against the dev backend (Plan 3 Task 10), with the `journeys`
// project's shared session (playwright.config.ts: a desktop, one test at a time, after the other
// projects, so no read-only spec sees her data change). The `sara` fixture (support/
// sara-guard.ts) reads her data first and puts it back after the test, however it ends: her
// wishlist, her address book and its default.

test.describe.configure({ mode: 'serial' })

/** A product sara has not saved (the guard has taken out any leftover of an earlier run). */
const PRODUCT = MARKERS.wishlist
const SAVE = 'افزودن به علاقه‌مندی‌ها'
const UNSAVE = 'حذف از علاقه‌مندی‌ها'
/** The address the journey adds (and deletes): a name no real address has. */
const TITLE = MARKERS.addressTitle

const buyBox = (page: Page) => page.getByRole('region', { name: 'خرید', exact: true })

async function tehran(page: Page): Promise<Province> {
  const response = await page.request.get('/api/bff/transportation/province/list/?limit=1500', {
    headers: { 'X-Requested-With': 'ff' },
  })
  expect(response.ok(), 'the provinces through the BFF').toBe(true)
  const { results } = ((await response.json()) as { data: Paginated<Province> }).data
  const province = results.find(({ name }) => name === 'تهران')
  expect(province, 'Tehran among the provinces').toBeDefined()
  return province!
}

test('wishlist: a heart on the product page, the product in «علاقه‌مندی‌ها», removed there', async ({
  page,
  sara,
}) => {
  const errors = watchErrors(page)
  expect(sara.before.wishlist.map(({ slug }) => slug)).not.toContain(PRODUCT.slug)
  await page.goto(`/product/${PRODUCT.slug}/`)
  await shellHydrated(page)
  const heart = buyBox(page).getByRole('button', { name: SAVE })
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/product/detail/${PRODUCT.slug}/wishlist/`) &&
      response.request().method() === 'POST',
  )
  await heart.click()
  await expect(buyBox(page).getByRole('button', { name: UNSAVE })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect((await saved).ok()).toBe(true)

  await page.goto('/account/wishlist/')
  const card = page
    .getByRole('list', { name: 'علاقه‌مندی‌ها' })
    .getByRole('article')
    .filter({ hasText: PRODUCT.name })
  await expect(card).toHaveCount(1)
  await card.getByRole('button', { name: UNSAVE }).click()
  await expect(card).toHaveCount(0)
  const toasts = page.getByRole('region', { name: /^اعلان‌ها/ })
  await expect(toasts.getByText(`«${PRODUCT.name}» از علاقه‌مندی‌ها حذف شد.`)).toBeVisible()
  await expect.poll(() => readWishlist(sara.request)).toEqual(sara.before.wishlist)
  expect(errors).toEqual([])
})

test('address: one added (Tehran, a city, a mobile, a postal code), made the default, deleted', async ({
  page,
  sara,
}) => {
  const errors = watchErrors(page)
  expect(sara.before.addresses.map(({ title }) => title)).not.toContain(TITLE)
  const province = await tehran(page)
  await page.goto('/account/addresses/')
  await page.getByRole('button', { name: 'افزودن آدرس جدید' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'افزودن آدرس جدید' })
  await sheet.getByRole('textbox', { name: /^عنوان آدرس/ }).fill(TITLE)
  await sheet.getByRole('combobox', { name: /^استان/ }).selectOption({ label: province.name })
  const city = sheet.getByRole('combobox', { name: /^شهر/ })
  await expect(city).toBeEnabled()
  await city.selectOption({ label: 'تهران' })
  await sheet.getByRole('textbox', { name: /^نشانی کامل/ }).fill('خیابان آزمون، کوچهٔ یکم')
  await sheet.getByRole('textbox', { name: /^کد پستی/ }).fill('۱۲۳۴۵۶۷۸۹۰')
  // Someone else receives it (the profile's own names are not used).
  const me = sheet.getByRole('checkbox', { name: 'گیرنده خودم هستم' })
  if ((await me.count()) > 0 && (await me.isChecked())) await me.uncheck()
  await sheet.getByRole('textbox', { name: /^نام گیرنده/ }).fill('آزمون')
  await sheet.getByRole('textbox', { name: /^نام خانوادگی گیرنده/ }).fill('خودکار')
  await sheet.getByRole('textbox', { name: /^شماره موبایل گیرنده/ }).fill('09121234567')
  // No location: the map stays closed (its tiles are a third party's).
  await sheet.getByRole('button', { name: 'ذخیرهٔ آدرس' }).click()
  await expect(sheet).toBeHidden()

  const card = page.getByRole('article', { name: TITLE })
  await expect(card).toBeVisible()
  await expect(card).toContainText('۰۹۱۲ ۱۲۳ ۴۵۶۷')
  await expect(card).toContainText('۱۲۳۴۵۶۷۸۹۰')
  await expect(card.getByText('پیش‌فرض', { exact: true })).toHaveCount(0)

  await card.getByRole('button', { name: `انتخاب به‌عنوان پیش‌فرض (آدرس ${TITLE})` }).click()
  await expect(card.getByText('پیش‌فرض', { exact: true })).toBeVisible()
  await expect(page.getByText('پیش‌فرض', { exact: true })).toHaveCount(1)
  // The default comes first.
  await expect(page.getByRole('article').first()).toHaveAccessibleName(TITLE)

  await card.getByRole('button', { name: `حذف آدرس ${TITLE}` }).click()
  const dialog = page.getByRole('dialog', { name: `آدرس «${TITLE}» حذف شود؟` })
  await dialog.getByRole('button', { name: 'حذف آدرس' }).click()
  await expect(dialog).toBeHidden()
  await expect(card).toHaveCount(0)
  await expect(page.getByRole('article')).toHaveCount(sara.before.addresses.length)
  expect(errors).toEqual([])
})
