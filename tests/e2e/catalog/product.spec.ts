import { expect, test, type Page } from '@playwright/test'
import { watchErrors } from '../support/watch-errors'

// The product page below the buying core (product-core.spec.ts): the section bar, the
// specifications, the reviews and questions (loaded in the browser when their section comes
// near) and the review form, against the dev backend's sample data (product digest §8, §12:
// the S25 Ultra has three reviews and one question). No review is ever sent from here.

const S25 = '/product/samsung-galaxy-s25-ultra/'
const BAR = 'بخش\u{200C}های صفحه\u{0654} محصول'
const REVIEWS = 'دیدگاه\u{200C}ها'

const bar = (page: Page) => page.getByRole('navigation', { name: BAR })
const reviews = (page: Page) => page.locator('section#reviews')

test.describe('product page sections', () => {
  test('the reviews section lists the reviews once it comes into view, without errors', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto(S25)
    await reviews(page).scrollIntoViewIfNeeded()
    const list = reviews(page).getByRole('list', { name: REVIEWS, exact: true })
    await expect(list.getByRole('article').first()).toBeVisible()
    expect(await list.getByRole('article').count()).toBeGreaterThanOrEqual(1)
    await expect(reviews(page).getByRole('list', { name: 'امتیازها' })).toBeVisible()
    const questions = page.locator('section#questions')
    await questions.scrollIntoViewIfNeeded()
    await expect(questions.getByRole('article').first()).toBeVisible()
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('the section bar scrolls to the reviews, just under the header and the bar', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    await page.goto(S25)
    const link = bar(page).getByRole('link', { name: new RegExp(`^${REVIEWS}`) })
    await link.click()
    const heading = reviews(page).getByRole('heading', { level: 2, name: REVIEWS })
    await expect(heading).toBeInViewport()
    await expect(link).toHaveAttribute('aria-current', 'true')
    await expect(reviews(page)).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`${S25}#reviews$`))
    // Once the smooth scroll and the header's compact switch settle, the section's top sits
    // 8px under the bar (0 to 16 allowed): never under it, and not far below.
    const gap = async (target: typeof heading) => {
      const [barBox, box] = await Promise.all([bar(page).boundingBox(), target.boundingBox()])
      return barBox && box ? Math.round(box.y - (barBox.y + barBox.height)) : -1
    }
    await expect
      .poll(async () => {
        const value = await gap(reviews(page))
        return value >= 0 && value <= 16 ? 'in place' : value
      })
      .toBe('in place')
    // The heading itself is clear of the bar (the card's padding is above it).
    expect(await gap(heading)).toBeGreaterThan(0)
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })

  test('the specifications join the values of a row', async ({ page }) => {
    await page.goto(S25)
    const specs = page.getByRole('region', { name: 'مشخصات' })
    await expect(specs.getByRole('definition').first()).toHaveText('مشکی، نقره ای، طلایی')
  })

  test('a guest review without a name is stopped at the name field, nothing sent', async ({
    page,
  }) => {
    const errors = watchErrors(page)
    const sent: string[] = []
    await page.route('**/comment/submit/**', (route) => {
      sent.push(route.request().url())
      return route.abort()
    })
    await page.goto(S25)
    await reviews(page).scrollIntoViewIfNeeded()
    await reviews(page).getByRole('button', { name: 'ثبت دیدگاه' }).click()
    const form = page.getByRole('form', { name: 'ثبت دیدگاه' })
    await form.getByRole('textbox', { name: /^متن دیدگاه/ }).fill('گوشی خوبی است')
    await form.getByRole('button', { name: 'ارسال دیدگاه' }).click()
    const name = form.getByRole('textbox', { name: /^نام \(/ })
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toHaveAccessibleDescription('نام خود را بنویسید.')
    await expect(name).toBeFocused()
    expect(sent).toEqual([])
    await page.waitForLoadState('load')
    expect(errors).toEqual([])
  })
})

test.describe('product page sections in the server HTML', () => {
  test.use({ javaScriptEnabled: false })

  test('has every section and the whole description for search engines', async ({ page }) => {
    await page.goto(S25)
    await expect(bar(page).getByRole('link')).toHaveCount(4)
    for (const id of ['intro', 'specs', 'reviews', 'questions']) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1)
    }
    await expect(page.locator('section#intro')).toContainText('گارانتی ۱۸ ماهه شرکتی')
  })
})
