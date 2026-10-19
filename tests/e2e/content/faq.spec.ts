import { expect, test, type Page } from '@playwright/test'
import { shellHydrated } from '../support/hydrated'
import { watchErrors } from '../support/watch-errors'

// The help centre, `/faq/` (Plan 5 Task 4), against the dev backend's (blog-faq digest §2.1: four
// categories, eleven questions, plain-text answers). Read only, every project, as a guest.

const CATEGORIES = ['سفارش و خرید', 'ارسال و تحویل', 'پرداخت و بازگشت وجه', 'مرجوعی و گارانتی']
const CHIPS = 'دسته\u{200C}های پرسش\u{200C}ها'

const main = (page: Page) => page.getByRole('main')
const search = (page: Page) =>
  main(page).getByRole('searchbox', { name: 'جستجو در پرسش\u{200C}ها' })
const question = (page: Page, id: number) => page.locator(`details#faq-${id}`)
const listed = (page: Page) => main(page).locator('details:visible')

test.describe('the help centre', () => {
  test('renders every category in the API’s order, one disclosure per question, its head', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const response = await page.goto('/faq/')
    expect(response?.status()).toBe(200)
    await expect(main(page).getByRole('heading', { level: 1 })).toHaveText('پرسش\u{200C}های متداول')
    await expect(main(page).getByRole('heading', { level: 2 })).toHaveText(CATEGORIES)
    await expect(main(page).locator('details')).toHaveCount(11)
    await expect(question(page, 10005).locator('summary')).toHaveText(
      'هزینه ارسال چطور محاسبه می شود؟',
    )

    await expect(page).toHaveTitle(/^پرسش\u{200C}های متداول \| /u)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/faq\/$/)
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
    const faq = ld.map((text) => JSON.parse(text)).find((data) => data['@type'] === 'FAQPage')
    expect(faq.mainEntity).toHaveLength(11)
    expect(faq.mainEntity[4]).toMatchObject({
      '@type': 'Question',
      name: 'هزینه ارسال چطور محاسبه می شود؟',
      acceptedAnswer: { '@type': 'Answer', text: expect.stringContaining('وزن مرسوله') },
    })
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('a question opens and closes from the keyboard (Enter on its summary)', async ({ page }) => {
    await page.goto('/faq/')
    const summary = question(page, 10001).locator('summary')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(question(page, 10001)).toHaveAttribute('open', '')
    await expect(question(page, 10001).getByText(/به سبد خرید اضافه کنید/)).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(question(page, 10001)).not.toHaveAttribute('open')
  })

  test('a chip leads to its category', async ({ page }) => {
    await page.goto('/faq/')
    const chips = main(page).getByRole('navigation', { name: CHIPS })
    await expect(chips.getByRole('link')).toHaveText(CATEGORIES)
    await chips.getByRole('link', { name: 'مرجوعی و گارانتی' }).click()
    await expect(page).toHaveURL(/#faq-category-10004$/)
    await expect(main(page).getByRole('heading', { name: 'مرجوعی و گارانتی' })).toBeInViewport()
  })

  test('the search: Persian-aware, its count said, an empty state', async ({ page }) => {
    await page.goto('/faq/')
    await shellHydrated(page)
    // An Arabic yeh, as some keyboards type it.
    await search(page).fill('هز\u{064A}نه')
    await expect(listed(page)).toHaveCount(1)
    await expect(question(page, 10005)).toBeVisible()
    await expect(main(page).getByRole('status')).toHaveText('۱ پرسش پیدا شد.')
    await expect(main(page).getByRole('navigation', { name: CHIPS })).toHaveCount(0)

    // Latin digits find the answer's Persian ones («۷۲ ساعت»).
    await search(page).fill('72 ساعت')
    await expect(listed(page)).toHaveCount(1)
    await expect(question(page, 10008)).toBeVisible()

    await search(page).fill('تخفیف ویژهٔ نوروز')
    await expect(listed(page)).toHaveCount(0)
    await expect(main(page).getByRole('status')).toHaveText('پرسشی پیدا نشد.')
    await expect(
      main(page).getByRole('link', { name: 'پرسش خود را برای ما بفرستید' }),
    ).toHaveAttribute('href', '/contact-us/')
    await search(page).fill('')
    await expect(listed(page)).toHaveCount(11)
  })

  test('a link to one question opens it, in view', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/faq/#faq-10010')
    await expect(question(page, 10010)).toHaveAttribute('open', '')
    await expect(question(page, 10010).locator('summary')).toBeInViewport()
    await expect(question(page, 10010).getByText(/تا هفت روز پس از تحویل/)).toBeVisible()
    await expect(main(page).locator('details[open]')).toHaveCount(1)
    expect(errors).toEqual([])
  })
})
