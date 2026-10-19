import { expect, test, type Page } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { watchErrors } from '../support/watch-errors'

// A post's page (Plan 5 Task 2) against the dev backend's sample blog: the article with its
// table of contents, its comments (the shop's official answer) and Q&A tabs, a real 404 for a
// post that is not there, and one counted view per page view (blog digest §1.5: every read of
// the post counts one; a prefetch must never render it). Read only, every project, as a guest:
// the comment form's POST is answered by the test itself (a real one creates a permanent pending
// row): the live one runs only with E2E_LIVE_COMMENT=1, once, on the desktop.
// Views: each load counts one. Per run: 2 loads of best-phones-under-30m per project (3 on the
// desktop with the live comment), and 3 of each project's own post (below).

const POST = '/blog/best-phones-under-30m/'
const SUBMIT = /\/api\/bff\/blog\/post\/[^/]+\/comment\/submit\/$/
const OK = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'
/** A post of the blog home's first page that no other spec opens, per project (its views). */
const OWN_POST: Record<string, string> = {
  mobile: 'airfryer-vs-oven',
  tablet: 'laptop-for-students',
  desktop: 'smartwatch-health-features',
}

const main = (page: Page) => page.getByRole('main')
const DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** The views the page shows («۴٬۸۲۳ بازدید»), as a number. */
async function views(page: Page): Promise<number> {
  const text = await main(page)
    .getByText(/^[۰-۹٬]+ بازدید$/)
    .textContent()
  const latin = [...(text ?? '')].map((c) => (DIGITS.includes(c) ? DIGITS.indexOf(c) : c)).join('')
  return Number(latin.replace(/[^0-9]/g, ''))
}

test.describe('a post', () => {
  test('its article, table of contents, comments with the shop’s answer, and the Q&A tab', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto(POST)
    expect(response?.status()).toBe(200)
    const article = main(page).getByRole('article', { name: /بهترین گوشی/ })
    await expect(article.getByRole('heading', { level: 1 })).toHaveAttribute('dir', 'auto')
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(article.getByText(/[۰-۹]+ دقیقه مطالعه$/)).toBeVisible()
    await shellHydrated(page)

    // The table of contents: folded on phones, beside the content from lg.
    const toc = article.getByRole('navigation', { name: 'فهرست مطالب' })
    const toggle = toc.getByRole('button', { name: 'فهرست مطالب' })
    if (await toggle.isVisible()) await toggle.click()
    const entry = toc.getByRole('link', { name: /معیارهای انتخاب ما/ })
    await entry.click()
    const id = 'معیارهای-انتخاب-ما'
    await expect(page).toHaveURL(new RegExp(`#${encodeURIComponent(id)}$`))
    await expect(page.locator(`[id="${id}"]`)).toBeFocused()
    await expect(page.locator(`[id="${id}"]`)).toBeInViewport()

    // The comments, page 1 in the HTML: the shop's answer under ali's question.
    const comments = main(page).getByRole('region', { name: 'دیدگاه\u{200C}ها و پرسش\u{200C}ها' })
    const list = comments.getByRole('list', { name: 'دیدگاه\u{200C}ها' })
    await expect(list.getByText('چرا گوشی های اپل در این لیست نیستند؟')).toBeVisible()
    await expect(
      list.getByRole('list', { name: /^پاسخ\u{200C}ها به/u }).getByText('پاسخ رسمی'),
    ).toBeVisible()
    await comments.getByRole('tab', { name: /پرسش و پاسخ/ }).click()
    await expect(comments.getByRole('tab', { name: /پرسش و پاسخ/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(comments.getByRole('button', { name: 'ثبت پرسش' })).toBeVisible()
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('a post that is not there answers a real 404', async ({ page }) => {
    const response = await page.goto('/blog/no-such-post-e2e/')
    expect(response?.status()).toBe(404)
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText(/پیدا نشد/)
  })

  test('one page view is one counted view: a load, a click from the blog, a reload', async ({
    page,
  }, info) => {
    const slug = OWN_POST[info.project.name] ?? OWN_POST.desktop!
    await page.goto(`/blog/${slug}/`)
    const first = await views(page)
    // The blog's cards never prefetch it: arriving by a click is one view more, not two.
    await page.goto('/blog/')
    await shellHydrated(page)
    await main(page).locator(`a[href="/blog/${slug}/"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`/blog/${slug}/$`))
    await expect.poll(() => views(page)).toBe(first + 1)
    await page.reload()
    expect(await views(page)).toBe(first + 2)
  })

  test('the comment form sends once and shows the moderation notice; nothing is inserted', async ({
    page,
  }) => {
    const sent: unknown[] = []
    await page.route(SUBMIT, async (route) => {
      sent.push(route.request().postDataJSON())
      await route.fulfill({ status: 201, json: { msg: OK, code: 201, data: {} } })
    })
    await page.goto(POST)
    await shellHydrated(page)
    const comments = main(page).getByRole('region', { name: 'دیدگاه\u{200C}ها و پرسش\u{200C}ها' })
    const before = await comments.getByRole('article').count()
    await comments.getByRole('button', { name: 'ثبت دیدگاه' }).click()
    await comments.getByRole('textbox', { name: /^متن دیدگاه/ }).fill('مقاله خوبی بود.')
    await comments.getByRole('textbox', { name: /^نام/ }).fill('آزمون')
    await comments.getByRole('button', { name: 'ارسال دیدگاه' }).click()
    await expect(comments.getByRole('status').filter({ hasText: OK })).toBeFocused()
    expect(sent).toEqual([{ review: 'مقاله خوبی بود.', name: 'آزمون' }])
    await expect(comments.getByRole('article')).toHaveCount(before)
  })

  test('live: a guest’s comment reaches the API, moderated (opt-in, once)', async ({
    page,
  }, info) => {
    test.skip(
      process.env.E2E_LIVE_COMMENT !== '1' || info.project.name !== 'desktop',
      'one real comment (a permanent pending row): E2E_LIVE_COMMENT=1, desktop only',
    )
    await page.goto(POST)
    await shellHydrated(page)
    const comments = main(page).getByRole('region', { name: 'دیدگاه\u{200C}ها و پرسش\u{200C}ها' })
    await comments.getByRole('button', { name: 'ثبت دیدگاه' }).click()
    await comments
      .getByRole('textbox', { name: /^متن دیدگاه/ })
      .fill('دیدگاه آزمایشی خودکار (e2e)؛ لطفاً تأیید نکنید.')
    await comments.getByRole('textbox', { name: /^نام/ }).fill('آزمون خودکار')
    const answer = page.waitForResponse((response) => SUBMIT.test(new URL(response.url()).pathname))
    await comments.getByRole('button', { name: 'ارسال دیدگاه' }).click()
    expect((await answer).status()).toBe(201)
    await expect(comments.getByRole('status')).toContainText('پس از تأیید')
    test.info().annotations.push({ type: 'writes', description: 'one pending blog comment' })
  })
})
