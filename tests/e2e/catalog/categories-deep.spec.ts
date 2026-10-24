import { expect, test } from '@playwright/test'
import { startMockShop, type MockShop } from '../support/mock-shop'
import { watchErrors } from '../support/watch-errors'

// `/categories/` with a third level (Plan 5 Task 9, carried from Task 8's re-review): a category
// below a root that has children of its own was a button only, so neither it nor its children
// were links in the server's HTML. The dev tree has two levels, and the page renders the tree on
// the server, so this runs against a shop of its own (support/mock-shop.ts) whose category list
// gives «گوشی موبایل» one child. Desktop only: the browser is the same component at every width.

const PARENT = '/product-category/digital/mobile-phone/'
const CHILD = { id: 99_001, name: 'گوشی آزمون', path: 'digital/mobile-phone/e2e-phones' }
const CHILD_HREF = `/product-category/${CHILD.path}/`

let shop: MockShop | undefined

test.beforeAll(async ({}, info) => {
  if (info.project.name !== 'desktop') return
  shop = await startMockShop((pathname, body) => {
    if (pathname !== '/api/v1/product/category/list/') return null
    const answer = body as { data: { current_page: number; results: Record<string, unknown>[] } }
    if (answer.data.current_page !== 1) return null
    const parent = answer.data.results.find((row) => row.path === 'digital/mobile-phone')
    if (!parent) return null
    answer.data.results.push({ ...parent, ...CHILD, slug: 'e2e-phones', parent_id: parent.id })
    return answer
  })
})
test.afterAll(async () => {
  await shop?.close()
})

test('a category with children of its own is a link, its children linked in the HTML', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one shop of its own, on a desktop')
  // The server's HTML, as a crawler or a visitor without JavaScript gets it.
  const plain = await browser.newContext({ javaScriptEnabled: false })
  const html = await plain.newPage()
  await html.goto(`${shop!.url}/categories/`)
  const panel = html.getByRole('tabpanel', { name: 'کالای دیجیتال' })
  await expect(panel.getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute('href', PARENT)
  await expect(html.locator(`a[href="${CHILD_HREF}"]`)).toBeAttached()
  await expect(html.locator(`a[href="${CHILD_HREF}"]`)).toBeHidden()
  await plain.close()

  // In the browser: its own control opens its children inside the page, and back.
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = watchErrors(page)
  await page.goto(`${shop!.url}/categories/`)
  const tab = page.getByRole('tabpanel', { name: 'کالای دیجیتال' })
  await expect(tab.getByRole('link', { name: CHILD.name })).toBeHidden()
  await tab.getByRole('button', { name: 'زیردسته\u{200C}های گوشی موبایل' }).click()
  await expect(tab.getByRole('heading', { name: 'گوشی موبایل' })).toBeFocused()
  await expect(tab.getByRole('link', { name: CHILD.name })).toHaveAttribute('href', CHILD_HREF)
  await expect(tab.getByRole('link', { name: CHILD.name })).toBeVisible()
  await tab.getByRole('button', { name: 'بازگشت' }).click()
  await expect(tab.getByRole('link', { name: 'گوشی موبایل' })).toBeVisible()
  await expect(tab.getByRole('link', { name: CHILD.name })).toBeHidden()
  expect(errors).toEqual([])
  await context.close()
})
