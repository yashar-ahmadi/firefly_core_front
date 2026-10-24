import { expect, test, type Page } from '@playwright/test'
import { axeFindings, axeReport, blocking, settled } from './support/axe'
import { SAMPLE } from './support/compare-seed'
import { shellHydrated } from './support/hydrated'

// Accessibility audit of the overlays (Plan 5 Task 8, with a11y.spec.ts): axe on the page with
// each menu, sheet and dialog open, where focus traps, names and contrast are easiest to miss.
// The same rules and threshold as the pages (support/axe.ts). Read only: nothing is written
// (quick view only opens; the search reads suggestions, cached a minute).

const PHONES = '/product-category/digital/mobile-phone/'
const CHOOSE = 'انتخاب ویژگی\u{200C}ها'

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

async function audit(page: Page, label: string): Promise<void> {
  await settled(page)
  const findings = await axeFindings(page)
  console.log(axeReport(label, findings))
  expect(blocking(findings), `${label}: serious or critical violations`).toEqual([])
}

test.describe('accessibility of the overlays (axe, WCAG 2.1 AA)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'a phone and a desktop')
  })

  test('the search, open with suggestions', async ({ page }, testInfo) => {
    await page.goto('/')
    await shellHydrated(page)
    const banner = page.getByRole('banner')
    let field = banner.getByRole('combobox', { name: 'جستجو' })
    if (isPhone(page)) {
      await banner.getByRole('searchbox', { name: 'جستجو' }).click()
      field = page.getByRole('dialog', { name: 'جستجو' }).getByRole('combobox', { name: 'جستجو' })
    }
    await field.fill('گوشی')
    await expect(page.getByRole('listbox').first()).toBeVisible()
    await audit(page, `search open ${testInfo.project.name}`)
  })

  test('quick view, from a category card', async ({ page }, testInfo) => {
    await page.goto(PHONES)
    await shellHydrated(page)
    await page
      .getByRole('list', { name: 'صفحهٔ ۱' })
      .getByRole('article')
      .filter({ has: page.getByRole('link', { name: SAMPLE.S25.name, exact: true }) })
      .getByRole('button', { name: CHOOSE })
      .click()
    const dialog = page.getByRole('dialog', { name: SAMPLE.S25.name })
    await expect(dialog.getByRole('radiogroup', { name: 'رنگ' })).toBeVisible()
    await audit(page, `quick view ${testInfo.project.name}`)
  })

  test('phone: the listing filters sheet', async ({ page }, testInfo) => {
    test.skip(!isPhone(page), 'a bottom sheet below lg')
    await page.goto(PHONES)
    await shellHydrated(page)
    await page.getByRole('button', { name: 'فیلترها' }).click()
    await expect(page.getByRole('dialog', { name: 'فیلترها' })).toBeVisible()
    await audit(page, `filters sheet ${testInfo.project.name}`)
  })

  test('desktop: the mega-menu, open', async ({ page }, testInfo) => {
    test.skip(isPhone(page), 'from lg up')
    await page.goto('/')
    await shellHydrated(page)
    const trigger = page.getByRole('button', { name: 'دسته\u{200C}بندی\u{200C}ها' })
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await audit(page, `mega-menu open ${testInfo.project.name}`)
  })

  test('desktop: the mini-cart, open', async ({ page }, testInfo) => {
    test.skip(isPhone(page), 'a drawer from md')
    await page.goto('/')
    await shellHydrated(page)
    await page
      .getByRole('banner')
      .getByRole('link', { name: /^سبد خرید/ })
      .click()
    await expect(page.getByRole('dialog', { name: 'سبد خرید' })).toBeVisible()
    await audit(page, `mini-cart open ${testInfo.project.name}`)
  })
})
