import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { watchErrors } from '../support/watch-errors'

// The registration and password-recovery pages against the dev backend: built from its
// settings, and checked before any request. No real code is ever asked for (`auth_otp_request`
// is 10/min per IP, with daily caps per address): every send is a page.route mock.

const API_URL = process.env.FIREFLY_API_URL ?? 'http://localhost:8000'
const METHOD_NAME = { email: 'ایمیل', phone: 'شماره موبایل' } as const

type Method = keyof typeof METHOD_NAME

async function registration(request: APIRequestContext) {
  const [settings, feature] = await Promise.all([
    request.get(`${API_URL}/api/v1/global/settings/`),
    request.get(`${API_URL}/api/v1/global/feature-status/registration/`),
  ])
  expect(settings.ok() && feature.ok(), 'settings and the registration feature').toBe(true)
  const { auth } = (
    (await settings.json()) as { data: { auth: { registration_methods: Method[] } } }
  ).data
  const { is_enabled } = ((await feature.json()) as { data: { is_enabled: boolean } }).data
  return { methods: auth.registration_methods, open: is_enabled }
}

/** The step's form is hydrated: a press runs the page's checks, not a native submit. */
async function formHydrated(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector('main form')
    return form !== null && Object.keys(form).some((key) => key.startsWith('__reactProps'))
  })
}

/** The auth requests the page sends: none for a check made before any request. */
function authRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/bff/account/auth/')) urls.push(request.url())
  })
  return urls
}

/**
 * From the login page to password recovery as a visitor goes: `identifier` typed, «ادامه», then
 * «فراموشی رمز عبور» on the password step. What was typed goes along (handed over by the link),
 * never in the URL.
 */
async function toRecovery(page: Page, identifier: string) {
  await page.goto('/login/')
  await expect(page.getByRole('button', { name: 'ادامه' })).toBeEnabled()
  await page.getByLabel('ایمیل یا شماره موبایل').fill(identifier)
  await page.getByRole('button', { name: 'ادامه' }).click()
  await page.getByRole('link', { name: 'فراموشی رمز عبور' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/forgot-password/' && url.search === '')
}

function ok(data: object) {
  return { status: 200, contentType: 'application/json', json: { msg: '', code: 200, data } }
}

const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 }

test.describe('registration', () => {
  test('offers the methods the settings list, and checks the identifier before sending', async ({
    page,
    request,
  }) => {
    const { methods, open } = await registration(request)
    const errors = watchErrors(page)
    const sent = authRequests(page)
    const response = await page.goto('/register/')
    expect(response?.status()).toBe(200)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.getByRole('heading', { level: 1, name: 'ثبت‌نام' })).toBeVisible()
    if (!open || methods.length === 0) {
      await expect(page.getByRole('link', { name: 'ورود به حساب کاربری' })).toBeVisible()
      await expect(page.getByRole('textbox')).toHaveCount(0)
      return
    }
    if (methods.length > 1) {
      await expect(page.getByRole('tab')).toHaveText(methods.map((method) => METHOD_NAME[method]))
    } else {
      await expect(page.getByRole('tablist')).toHaveCount(0)
      await expect(page.getByRole('tab')).toHaveCount(0)
    }

    await formHydrated(page)
    await page.getByRole('textbox', { name: 'نام', exact: true }).fill('آزمون')
    await page.getByRole('textbox', { name: 'نام خانوادگی' }).fill('خودکار')
    const identifier = page.getByRole('textbox', { name: METHOD_NAME[methods[0]!], exact: true })
    await identifier.fill('not-an-identifier')
    await page.getByRole('button', { name: 'دریافت کد تأیید' }).click()
    await expect(identifier).toHaveAttribute('aria-invalid', 'true')
    await expect(identifier).toBeFocused()
    await expect(identifier).toHaveAccessibleDescription(/درست وارد کنید/)
    expect(sent).toEqual([])
    expect(errors).toEqual([])
  })

  test('a start the API answers (mocked) moves on to the code, its first box focused', async ({
    page,
    request,
  }) => {
    const { methods, open } = await registration(request)
    test.skip(!open || !methods.includes('email'), 'email registration is not offered')
    const errors = watchErrors(page)
    await page.route('**/api/bff/account/auth/register/start/', (route) =>
      route.fulfill(ok({ ...SENT, registration_token: 'e2e-token' })),
    )
    await page.goto('/register/')
    await formHydrated(page)
    await page.getByRole('textbox', { name: 'نام', exact: true }).fill('آزمون')
    await page.getByRole('textbox', { name: 'نام خانوادگی' }).fill('خودکار')
    if (methods.length > 1) await page.getByRole('tab', { name: 'ایمیل' }).click()
    await page.getByRole('textbox', { name: 'ایمیل', exact: true }).fill('e2e-noreply@example.com')
    await page.getByRole('button', { name: 'دریافت کد تأیید' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'تأیید ایمیل' })).toBeVisible()
    await expect(page.getByLabel('رقم ۱')).toBeFocused()
    await expect(page.getByRole('button', { name: 'ارسال مجدد کد' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(errors).toEqual([])
  })
})

test.describe('password recovery', () => {
  test('prefills the identifier typed on login, and checks it before sending', async ({ page }) => {
    const errors = watchErrors(page)
    const sent = authRequests(page)
    const response = await page.goto('/forgot-password/')
    expect(response?.status()).toBe(200)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await toRecovery(page, ' Sara@Example.com ')
    const field = page.getByRole('textbox', { name: 'ایمیل یا شماره موبایل' })
    await expect(field).toHaveValue('Sara@Example.com')
    await formHydrated(page)
    await field.fill('sara@')
    await page.getByRole('button', { name: 'ارسال کد بازیابی' }).click()
    await expect(field).toBeFocused()
    await expect(field).toHaveAccessibleDescription(/درست وارد کنید/)
    expect(sent).toEqual([])
    expect(errors).toEqual([])
  })

  test('ends on the login page, prefilled, saying so (every answer mocked)', async ({ page }) => {
    const errors = watchErrors(page)
    await page.route('**/api/bff/account/auth/password-reset/request/', (route) =>
      route.fulfill(ok(SENT)),
    )
    await page.route('**/api/bff/account/auth/password-reset/verify-otp/', (route) =>
      route.fulfill(ok({ reset_token: 'e2e-reset', expires_in: 600 })),
    )
    await page.route('**/api/bff/account/auth/password-reset/confirm/', (route) =>
      route.fulfill(ok({})),
    )
    await toRecovery(page, 'e2e-noreply@example.com')
    await formHydrated(page)
    await page.getByRole('button', { name: 'ارسال کد بازیابی' }).click()
    await expect(page.getByLabel('رقم ۱')).toBeFocused()
    await page.keyboard.type('123456')
    const password = page.getByLabel('رمز عبور جدید', { exact: true })
    await expect(password).toBeFocused()
    await password.fill('Firefly@5678')
    await page.getByLabel('تکرار رمز عبور جدید').fill('Firefly@5678')
    await page.getByRole('button', { name: 'تغییر رمز عبور' }).click()
    // Back on login, prefilled: the address went along, never in the URL.
    await expect(page).toHaveURL((url) => url.pathname === '/login/' && url.search === '')
    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'رمز عبور تغییر کرد؛ دوباره وارد شوید' }),
    ).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'ایمیل یا شماره موبایل' })).toHaveValue(
      'e2e-noreply@example.com',
    )
    expect(errors).toEqual([])
  })
})
