import { expect, test } from '@playwright/test'

// With JavaScript off, the auth forms say so and never submit: their submit button is disabled
// in the server HTML, so Enter in a field sends nothing (no GET with personal data in the URL,
// the history or the server logs).

test.use({ javaScriptEnabled: false })

const NO_SCRIPT = 'برای ورود و ثبت‌نام، جاوااسکریپت مرورگر را فعال کنید.'

const PAGES = [
  { path: '/login/', field: 'ایمیل یا شمارهٔ موبایل', submit: 'ادامه', value: 'e2e@example.com' },
  { path: '/register/', field: 'نام', submit: 'دریافت کد تأیید', value: 'آزمون' },
  {
    path: '/forgot-password/',
    field: 'ایمیل یا شمارهٔ موبایل',
    submit: 'ارسال کد بازیابی',
    value: 'e2e@example.com',
  },
]

for (const { path, field, submit, value } of PAGES) {
  test(`${path} without JavaScript: the notice, a disabled button, and Enter goes nowhere`, async ({
    page,
  }) => {
    await page.goto(path)
    // Playwright's text and role engines skip <noscript>; with scripting off its content is real
    // markup, laid out like any other.
    const notice = page.locator('main noscript > p')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveText(NO_SCRIPT)
    const closed = page.getByRole('link', { name: 'ورود به حساب کاربری' })
    test.skip(await closed.isVisible(), 'registration is closed: there is no form')
    const button = page.getByRole('button', { name: submit })
    await expect(button).toBeDisabled()
    await expect(page.locator('main form')).toHaveAttribute('method', 'post')

    const navigations: string[] = []
    page.on('request', (request) => {
      if (request.isNavigationRequest()) navigations.push(`${request.method()} ${request.url()}`)
    })
    const input = page.getByRole('textbox', { name: field, exact: true })
    await input.fill(value)
    await input.press('Enter')
    await button.click({ force: true })
    // An absence to check: give a submission the time it would take to start.
    await page.waitForTimeout(500)
    expect(navigations).toEqual([])
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path)
    await expect(input).toHaveValue(value)
  })
}
