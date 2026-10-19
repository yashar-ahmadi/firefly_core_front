import { expect, test, type Page } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// Content pages, `/page/<slug>/` (Plan 5 Task 3), against the dev backend's pages (content
// digest §3–§4): `about-us` (layout `default`, its form open, one approved comment with the
// shop's answer), `contact-us` (closed, no comments: no block), `terms` (open, none yet), and
// real 404s for a page that is not there and for a draft. Every dev page is `default`: the
// `with_sidebar` aside and `full_width` are unit-tested (tests/unit/content/content-page.test.tsx).
// Read only, every project, as a guest: the form's POST is answered by the test itself (a real
// one creates a permanent pending row); the live one runs only with E2E_LIVE_PAGE_COMMENT=1,
// once, on the desktop.

const SUBMIT = /\/api\/bff\/pages\/[^/]+\/comment\/submit\/$/
const OK = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'
const TITLE = 'دیدگاه\u{200C}ها و پرسش\u{200C}ها'

const main = (page: Page) => page.getByRole('main')
const commentsOf = (page: Page) => main(page).getByRole('region', { name: TITLE })

test.describe('a content page', () => {
  test('about-us: its layout, one h1, its head, and its comments with the shop’s answer', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/page/about-us/')
    expect(response?.status()).toBe(200)
    await expect(main(page).locator('[data-layout]')).toHaveAttribute('data-layout', 'default')
    const article = main(page).getByRole('article', { name: 'درباره ما' })
    await expect(article.getByRole('heading', { level: 2, name: 'ما که هستیم؟' })).toBeVisible()
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('درباره ما')

    // The head: the title with the shop's name, a self canonical with its slash, the trail.
    await expect(page).toHaveTitle(/^درباره ما \| /)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/page\/about-us\/$/,
    )
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
    const trail = ld
      .map((text) => JSON.parse(text))
      .find((data) => data['@type'] === 'BreadcrumbList')
    expect(trail.itemListElement.at(-1)).toMatchObject({ name: 'درباره ما' })

    // The comments, page 1 in the HTML: sara's, and the shop's answer under it.
    const comments = commentsOf(page)
    await expect(comments.getByRole('tab', { name: 'دیدگاه\u{200C}ها (۱ دیدگاه)' })).toBeVisible()
    const list = comments.getByRole('list', { name: 'دیدگاه\u{200C}ها' })
    await expect(list.getByText(/همهٔ کالاها اصل و سالم/)).toBeVisible()
    await expect(
      list.getByRole('list', { name: /^پاسخ\u{200C}ها به/u }).getByText('پاسخ فروشگاه'),
    ).toBeVisible()
    await expect(comments.getByRole('button', { name: 'ثبت دیدگاه' })).toBeVisible()
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('contact-us: closed and without comments, no comments block', async ({ page }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/page/contact-us/')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('تماس با ما')
    await expect(commentsOf(page)).toHaveCount(0)
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('a page that is not there, and a draft, answer a real 404', async ({ page }) => {
    const errors = watchErrors(page)
    for (const path of ['/page/no-such-page-e2e/', '/page/shipping-guide-draft/']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
      forgiveFailure(page, new URL(path, page.url()).toString(), 404)
      await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(/پیدا نشد/)
    }
    expect(errors).toEqual([])
  })

  test('the form sends once to the page’s own path; the notice, nothing inserted', async ({
    page,
  }) => {
    const sent: unknown[] = []
    await page.route(SUBMIT, async (route) => {
      sent.push(route.request().postDataJSON())
      await route.fulfill({ status: 201, json: { msg: OK, code: 201, data: {} } })
    })
    await page.goto('/page/terms/')
    await shellHydrated(page)
    const comments = commentsOf(page)
    await comments.getByRole('button', { name: 'ثبت دیدگاه' }).click()
    await comments.getByRole('textbox', { name: /^متن دیدگاه/ }).fill('صفحهٔ روشنی است.')
    await comments.getByRole('textbox', { name: /^نام/ }).fill('آزمون')
    await comments.getByRole('button', { name: 'ارسال دیدگاه' }).click()
    await expect(comments.getByRole('status').filter({ hasText: OK })).toBeFocused()
    expect(sent).toEqual([{ review: 'صفحهٔ روشنی است.', name: 'آزمون' }])
    await expect(comments.getByRole('article')).toHaveCount(0)
  })

  test('a form the operator closed meanwhile (403): it goes, with the API’s sentence', async ({
    page,
  }) => {
    const closed = 'ثبت نظر برای این صفحه غیرفعال است.'
    await page.route(SUBMIT, (route) =>
      route.fulfill({
        status: 403,
        json: {
          msg: 'شما اجازه انجام این دستور را ندارید.',
          code: 403,
          data: {
            type: 'client_error',
            errors: [{ code: 'page_comments_disabled', detail: closed, attr: null }],
          },
        },
      }),
    )
    await page.goto('/page/terms/')
    await shellHydrated(page)
    const comments = commentsOf(page)
    await comments.getByRole('button', { name: 'ثبت دیدگاه' }).click()
    await comments.getByRole('textbox', { name: /^متن دیدگاه/ }).fill('صفحهٔ روشنی است.')
    await comments.getByRole('textbox', { name: /^نام/ }).fill('آزمون')
    await comments.getByRole('button', { name: 'ارسال دیدگاه' }).click()
    await expect(comments.getByText(closed)).toBeFocused()
    await expect(comments.getByRole('button', { name: /^ثبت|^ارسال/ })).toHaveCount(0)
  })

  test('live: a guest’s comment reaches the API, moderated (opt-in, once)', async ({
    page,
  }, info) => {
    test.skip(
      process.env.E2E_LIVE_PAGE_COMMENT !== '1' || info.project.name !== 'desktop',
      'one real comment (a permanent pending row): E2E_LIVE_PAGE_COMMENT=1, desktop only',
    )
    await page.goto('/page/terms/')
    await shellHydrated(page)
    const comments = commentsOf(page)
    await comments.getByRole('button', { name: 'ثبت دیدگاه' }).click()
    await comments
      .getByRole('textbox', { name: /^متن دیدگاه/ })
      .fill('دیدگاه آزمایشی خودکار (e2e)؛ لطفاً تأیید نکنید.')
    await comments.getByRole('textbox', { name: /^نام/ }).fill('آزمون خودکار')
    const answer = page.waitForResponse((response) => SUBMIT.test(new URL(response.url()).pathname))
    await comments.getByRole('button', { name: 'ارسال دیدگاه' }).click()
    expect((await answer).status()).toBe(201)
    await expect(comments.getByRole('status')).toContainText('پس از تأیید')
    test.info().annotations.push({ type: 'writes', description: 'one pending page comment' })
  })
})
