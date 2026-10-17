import { expect, type Page } from '@playwright/test'
import { codeChannels } from '@/features/auth/login-methods'
import type { AuthSettings, SiteSettings } from '@/lib/api/types/settings'
import { SARA, signedInTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// The profile page against the dev backend (Plan 3 Task 6). Read-only with the project's shared
// session (`signedInTest`): nothing is saved, no code is asked for (the dev backend cannot send
// one), two-step login is not started, and «خروج از همهٔ دستگاه‌ها» is opened and cancelled,
// never confirmed (it would end the shared session).

const SECTIONS = [
  'نام و نام خانوادگی',
  'تصویر پروفایل',
  'ایمیل و شماره موبایل',
  'رمز عبور',
  'ورود دومرحله‌ای',
  'نشست‌ها',
]

/** The settings' `auth` block, read the way the page gets it (`global/settings/`). */
async function authSettings(page: Page): Promise<AuthSettings> {
  const response = await page.request.get('/api/bff/global/settings/', {
    headers: { 'X-Requested-With': 'ff' },
  })
  expect(response.ok(), 'global/settings/ through the BFF').toBe(true)
  return ((await response.json()) as { data: SiteSettings }).data.auth
}

async function openProfile(page: Page) {
  const response = await page.goto('/account/profile/')
  expect(response?.status()).toBe(200)
  // The profile is in: the names are filled from it.
  await expect(page.getByRole('textbox', { name: 'نام', exact: true })).toHaveValue('سارا')
  return response
}

signedInTest('shows sara’s profile: every section, the names filled in', async ({ page }) => {
  const errors = watchErrors(page)
  const response = await openProfile(page)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.getByRole('heading', { level: 1, name: 'اطلاعات حساب' })).toBeVisible()
  for (const name of SECTIONS) {
    const region = page.getByRole('region', { name, exact: true })
    await expect(region.getByRole('heading', { level: 2, name, exact: true })).toBeVisible()
  }

  await expect(page.getByRole('textbox', { name: 'نام خانوادگی' })).toHaveValue('احمدی')
  // Nothing changed: nothing to save.
  await expect(page.getByRole('button', { name: 'ذخیرهٔ نام' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )

  const email = page.getByRole('group', { name: 'ایمیل', exact: true })
  await expect(email).toContainText(SARA.email)
  await expect(email).toContainText('تأیید شده')
  await expect(email.getByRole('button', { name: 'تغییر ایمیل' })).toBeVisible()
  const phone = page.getByRole('group', { name: 'شماره موبایل', exact: true })
  await expect(phone).toContainText('۰۹۱۲ ۱۲۳ ۴۵۰۱')
  await expect(phone).toContainText('تأیید شده')
  // A change is offered only when a code can reach a phone (SMS or Telegram on; off in dev).
  const phoneChangeable = codeChannels(await authSettings(page), 'phone').otpChannels.length > 0
  await expect(phone.getByRole('button', { name: 'تغییر شماره موبایل' })).toHaveCount(
    phoneChangeable ? 1 : 0,
  )
  if (!phoneChangeable) await expect(phone).toContainText('در این فروشگاه ممکن نیست.')

  // sara has a password: changing it asks for the current one.
  await expect(page.getByLabel('رمز فعلی', { exact: true })).toHaveAttribute(
    'autocomplete',
    'current-password',
  )
  await expect(page.getByLabel('رمز عبور جدید', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  )

  const twoFactor = page.getByRole('region', { name: 'ورود دومرحله‌ای' })
  await expect(twoFactor.getByText('غیرفعال', { exact: true })).toBeVisible()
  await expect(twoFactor.getByRole('button', { name: 'فعال‌سازی ورود دومرحله‌ای' })).toBeVisible()

  // No sideways page scroll, and every button of the page at least 44px tall.
  const width = page.viewportSize()?.width ?? 0
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  const main = page.getByRole('main')
  for (const button of await main.getByRole('button').all()) {
    if (!(await button.isVisible())) continue
    const box = await button.boundingBox()
    expect(box?.height ?? 0, await button.innerText()).toBeGreaterThanOrEqual(44)
  }
  expect(errors).toEqual([])
})

signedInTest(
  'the email change asks for the current password; «انصراف» closes it',
  async ({ page }) => {
    const errors = watchErrors(page)
    await openProfile(page)
    const email = page.getByRole('group', { name: 'ایمیل', exact: true })
    const change = email.getByRole('button', { name: 'تغییر ایمیل' })
    await change.click()
    await expect(change).toHaveAttribute('aria-expanded', 'true')
    await expect(email.getByRole('textbox', { name: 'ایمیل تازه' })).toBeFocused()
    await expect(email.getByLabel('رمز فعلی', { exact: true })).toBeVisible()
    // Two-step login is off for sara: no authenticator code.
    await expect(email.getByRole('group', { name: 'کد برنامهٔ احراز هویت' })).toHaveCount(0)
    await email.getByRole('button', { name: 'انصراف' }).click()
    await expect(change).toHaveAttribute('aria-expanded', 'false')
    await expect(change).toBeFocused()
    expect(errors).toEqual([])
  },
)

signedInTest(
  '«خروج از همهٔ دستگاه‌ها» asks first, in a dialog that keeps the focus',
  async ({ page }) => {
    const errors = watchErrors(page)
    await openProfile(page)
    const open = page.getByRole('button', { name: 'خروج از همهٔ دستگاه‌ها' })
    await open.click()
    const dialog = page.getByRole('dialog', { name: 'از همهٔ دستگاه‌ها خارج می‌شوید؟' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'انصراف' })).toBeFocused()
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(open).toBeFocused()
    // Still signed in: the page is still the profile.
    await expect(page.getByRole('heading', { level: 1, name: 'اطلاعات حساب' })).toBeVisible()
    expect(errors).toEqual([])
  },
)
