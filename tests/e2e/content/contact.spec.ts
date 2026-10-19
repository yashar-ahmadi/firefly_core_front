import { expect, test, type Page } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { watchErrors } from '../support/watch-errors'

// The contact page, `/contact-us/` (Plan 5 Task 4), against the dev backend (content digest §9:
// five subjects; the operator's `contact-us` page, whose content shows above the form; the
// shop's details from the settings). Read only, every project, as a guest: every POST is
// answered by the test (a real message is a permanent row in the panel's inbox), and so is the
// subject list read again after a stale-subject refusal. The live message runs only with
// E2E_LIVE_CONTACT=1, once, on the desktop.

const SUBMIT = /\/api\/bff\/contact-us\/message\/submit\/$/
const SUBJECTS = /\/api\/bff\/contact-us\/subject\/list\//
const DONE = 'پیام شما ثبت شد و به\u{200C}زودی بررسی می\u{200C}شود.'
const CHANNEL = 'ایمیل یا شمارهٔ موبایل خود را بنویسید تا پاسخ به دستتان برسد.'

const form = (page: Page) => page.getByRole('form', { name: 'فرم تماس' })
const subject = (page: Page) => form(page).getByRole('combobox', { name: /موضوع پیام/ })
const field = (page: Page, name: RegExp) => form(page).getByRole('textbox', { name })
const send = (page: Page) => form(page).getByRole('button', { name: 'ارسال پیام' })

function refusal(code: string, detail: string, attr: string | null = null) {
  return {
    status: 400,
    json: {
      msg: 'درخواست ارسالی معتبر نیست.',
      code: 400,
      data: { type: attr ? 'validation_error' : 'client_error', errors: [{ code, detail, attr }] },
    },
  }
}

async function open(page: Page) {
  await page.goto('/contact-us/')
  await shellHydrated(page)
  await expect(send(page)).toBeEnabled()
}

async function fillIn(page: Page, { phone = '۰۹۱۲ ۱۲۳ ۴۵۶۷', email = '' } = {}) {
  await subject(page).selectOption({ label: 'سایر' })
  await field(page, /^نام/).fill('آزمون')
  if (email) await field(page, /ایمیل/).fill(email)
  if (phone) await field(page, /موبایل/).fill(phone)
  await field(page, /متن پیام/).fill('پیام آزمایشی برای فرم تماس.')
}

test.describe('the contact page', () => {
  test('renders the page’s content, the shop’s details and the form with its subjects', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/contact-us/')
    expect(response?.status()).toBe(200)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('تماس با ما')
    await expect(main.getByRole('heading', { name: 'ساعات پاسخگویی' })).toBeVisible()
    const info = main.getByRole('region', { name: 'راه\u{200C}های ارتباطی' })
    await expect(info.getByRole('link', { name: 'support@firefly-core.ir' })).toBeVisible()
    await expect(info.getByRole('link', { name: 'مشاهده روی نقشه' })).toBeVisible()
    await expect(subject(page).locator('option')).toHaveText([
      'انتخاب کنید',
      'پیگیری سفارش',
      'پیشنهاد',
      'انتقاد و شکایت',
      'همکاری',
      'سایر',
    ])
    await expect(page).toHaveTitle(/^تماس با ما \| /)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/contact-us\/$/)
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('without e-mail and phone: the API’s sentence, the focus on e-mail, nothing sent', async ({
    page,
  }) => {
    let sent = 0
    await page.route(SUBMIT, (route) => {
      sent += 1
      return route.abort()
    })
    await open(page)
    await fillIn(page, { phone: '' })
    await send(page).click()
    await expect(form(page).getByText(CHANNEL)).toBeVisible()
    await expect(field(page, /ایمیل/)).toBeFocused()
    expect(sent).toBe(0)
  })

  test('sends once, as the API wants it; the API’s sentence, the form cleared', async ({
    page,
  }) => {
    const bodies: unknown[] = []
    await page.route(SUBMIT, async (route) => {
      bodies.push(route.request().postDataJSON())
      await route.fulfill({ status: 201, json: { msg: DONE, code: 201, data: {} } })
    })
    await open(page)
    await fillIn(page)
    await send(page).click()
    await expect(form(page).getByText(DONE)).toBeVisible()
    expect(bodies).toEqual([
      {
        subject: 5,
        name: 'آزمون',
        phone: '09121234567',
        message: 'پیام آزمایشی برای فرم تماس.',
        website: '',
      },
    ])
    await expect(field(page, /متن پیام/)).toBeFocused()
    await expect(field(page, /متن پیام/)).toHaveValue('')
    await expect(subject(page)).toHaveValue('')
  })

  test('a landline: the API’s invalid_iranian_mobile under the phone', async ({ page }) => {
    const detail =
      'شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی\u{200C}شود.'
    await page.route(SUBMIT, (route) =>
      route.fulfill(refusal('invalid_iranian_mobile', detail, 'phone')),
    )
    await open(page)
    await fillIn(page, { phone: '02188776655' })
    await send(page).click()
    await expect(field(page, /موبایل/)).toBeFocused()
    await expect(field(page, /موبایل/)).toHaveAccessibleDescription(new RegExp(detail))
  })

  test('a subject switched off meanwhile: the list read again, the typed text kept', async ({
    page,
  }) => {
    await page.route(SUBMIT, (route) =>
      route.fulfill(
        refusal(
          'contact_subject_unavailable',
          'این موضوع دیگر در فهرست نیست؛ صفحه را تازه کنید و موضوع دیگری انتخاب کنید.',
        ),
      ),
    )
    await page.route(SUBJECTS, (route) =>
      route.fulfill({
        json: {
          msg: '',
          code: 200,
          data: {
            count: 2,
            total_pages: 1,
            current_page: 1,
            page_size: 100,
            next: null,
            previous: null,
            results: [
              { id: 1, title: 'پیگیری سفارش' },
              { id: 2, title: 'پیشنهاد' },
            ],
          },
        },
      }),
    )
    await open(page)
    await fillIn(page)
    await send(page).click()
    await expect(subject(page)).toBeFocused()
    await expect(subject(page).locator('option')).toHaveText([
      'انتخاب کنید',
      'پیگیری سفارش',
      'پیشنهاد',
    ])
    await expect(subject(page)).toHaveAccessibleDescription(/فهرست موضوع\u{200C}ها تغییر کرده بود/u)
    await expect(field(page, /^نام/)).toHaveValue('آزمون')
    await expect(field(page, /متن پیام/)).toHaveValue('پیام آزمایشی برای فرم تماس.')
  })

  test('a 429: the button held, the wait in minutes', async ({ page }) => {
    await page.route(SUBMIT, (route) =>
      route.fulfill({
        status: 429,
        json: {
          msg: 'x',
          code: 429,
          data: {
            type: 'client_error',
            errors: [{ code: 'throttled', detail: 'x', attr: null }],
            retry_after: 3506,
          },
        },
      }),
    )
    await open(page)
    await fillIn(page)
    await send(page).click()
    await expect(form(page).getByRole('alert')).toContainText('۵۹ دقیقهٔ دیگر')
    await expect(send(page)).toHaveAttribute('aria-disabled', 'true')
  })

  test('/contact/ and /page/contact-us/ send to /contact-us/ for good (308)', async ({ page }) => {
    for (const path of ['/contact/', '/page/contact-us/']) {
      const response = await page.request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(308)
      expect(response.headers()['location'], path).toMatch(/^(?:https?:\/\/[^/]+)?\/contact-us\/$/)
    }
    await page.goto('/contact/')
    await expect(page).toHaveURL(/\/contact-us\/$/)
  })

  test('live: a message reaches the API (opt-in, once)', async ({ page }, info) => {
    test.skip(
      process.env.E2E_LIVE_CONTACT !== '1' || info.project.name !== 'desktop',
      'one real message (a permanent row in the inbox): E2E_LIVE_CONTACT=1, desktop only',
    )
    await open(page)
    await subject(page).selectOption({ label: 'سایر' })
    await field(page, /^نام/).fill('آزمون خودکار')
    await field(page, /ایمیل/).fill('e2e@example.com')
    await field(page, /متن پیام/).fill('پیام آزمایشی خودکار (e2e)؛ لطفاً پاسخ ندهید.')
    const answer = page.waitForResponse((response) => SUBMIT.test(new URL(response.url()).pathname))
    await send(page).click()
    expect((await answer).status()).toBe(201)
    await expect(form(page).getByText(DONE)).toBeVisible()
    test.info().annotations.push({ type: 'writes', description: 'one contact message' })
  })
})
