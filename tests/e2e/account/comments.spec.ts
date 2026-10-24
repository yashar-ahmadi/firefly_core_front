import { expect, type Locator, type Page } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { MyComment } from '@/lib/api/types/dashboard'
import { settleRoutes } from '../support/live-route'
import { signedInTest as sessionTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// «دیدگاه‌های من» against the dev backend (Plan 3 Task 8), with the project's shared session
// (`signedInTest`). Read-only: a withdrawn comment cannot come back, so no delete ever reaches the
// API (every one is refused here, or answered here in the delete test, whose list is served here).

/** Sara's session; the routes' live handlers finish before a test ends (`settleRoutes`). */
const signedInTest = sessionTest.extend<{ routesSettle: void }>({
  routesSettle: [settleRoutes, { auto: true }],
})

const DELETE = /\/api\/bff\/dashboard\/comment\/(?:product|post|page)\/\d+\/delete\//
const LIST = /\/api\/bff\/dashboard\/comment\/list\//
const SUMMARY = /\/api\/bff\/dashboard\/summary\//

/** A button's target height: its box, or further where its ::after hit area reaches. */
function targetHeight(control: Locator): Promise<number> {
  return control.evaluate((node) => {
    const height = node.getBoundingClientRect().height
    const after = getComputedStyle(node, '::after')
    if (after.content === 'none' || after.position !== 'absolute') return height
    const reach = (inset: string) => Math.max(0, -(parseFloat(inset) || 0))
    return height + reach(after.top) + reach(after.bottom)
  })
}

/** sara's comments as the page reads them (`query`: the API's own). */
async function liveComments(page: Page, query = ''): Promise<Paginated<MyComment>> {
  const response = await page.request.get(`/api/bff/dashboard/comment/list/${query}`, {
    headers: { 'X-Requested-With': 'ff' },
  })
  expect(response.ok(), 'dashboard/comment/list/ through the BFF').toBe(true)
  return ((await response.json()) as { data: Paginated<MyComment> }).data
}

/** Refuses every delete (none is expected); returns the ones tried. */
async function refuseDeletes(page: Page): Promise<string[]> {
  const tried: string[] = []
  await page.route(DELETE, (route) => {
    tried.push(`${route.request().method()} ${route.request().url()}`)
    return route.abort()
  })
  return tried
}

const list = (page: Page) => page.getByRole('list', { name: 'دیدگاه‌های من' })
/** The toaster's region (the shell's live region says the same words, unseen). */
const toasts = (page: Page) => page.getByRole('region', { name: /^اعلان‌ها/ })
const rows = (page: Page) => list(page).getByRole('article')

signedInTest(
  'shows sara’s comments: every row, its status, the shop’s answer',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await refuseDeletes(page)
    const response = await page.goto('/account/comments/')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle(/^دیدگاه‌های من \| /)
    await expect(page.getByRole('heading', { level: 1, name: 'دیدگاه‌های من' })).toBeVisible()

    const live = await liveComments(page)
    await expect(rows(page)).toHaveCount(live.results.length)
    for (const comment of live.results) {
      const row = list(page).getByRole('article', { name: comment.subject.name })
      await expect(row.getByText(comment.status_display, { exact: true })).toBeVisible()
      await expect(
        row.getByRole('button', { name: `حذف دیدگاه روی «${comment.subject.name}»` }),
      ).toBeVisible()
      for (const reply of comment.replies) {
        await expect(row.getByText(reply.review)).toBeVisible()
        if (reply.is_user_admin) await expect(row.getByText('پاسخ فروشگاه')).toBeVisible()
      }
    }
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(
        page
          .getByRole('navigation', { name: 'حساب کاربری' })
          .getByRole('link', { name: /^دیدگاه‌های من/ }),
      ).toHaveAttribute('aria-current', 'page')
    }
    // No sideways page scroll; every target of the filters and the rows at least 44px tall.
    const width = page.viewportSize()?.width ?? 0
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    const controls = page
      .getByRole('main')
      .locator('nav[aria-label="نوع دیدگاه"] a, [role="group"] a')
    for (const control of [
      ...(await controls.all()),
      ...(await list(page).getByRole('button').all()),
    ]) {
      if (!(await control.isVisible())) continue
      expect(await targetHeight(control), await control.innerText()).toBeGreaterThanOrEqual(44)
    }
    expect(tried).toEqual([])
    expect(errors).toEqual([])
  },
)

signedInTest('the tabs and the status chips change the URL and the list', async ({ page }) => {
  const errors = watchErrors(page)
  const tried = await refuseDeletes(page)
  await page.goto('/account/comments/')
  await expect(rows(page).first()).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'نوع دیدگاه' })
  const statuses = page.getByRole('group', { name: 'وضعیت دیدگاه' })

  await tabs.getByRole('link', { name: 'محصولات' }).click()
  await expect(page).toHaveURL(/\/account\/comments\/\?type=product$/)
  await expect(tabs.getByRole('link', { name: 'محصولات' })).toHaveAttribute('aria-current', 'page')
  const products = await liveComments(page, '?subject_type=product')
  await expect(rows(page)).toHaveCount(products.results.length)
  await expect(rows(page).getByText('محصول', { exact: true })).toHaveCount(products.results.length)

  await statuses.getByRole('link', { name: 'در انتظار تأیید' }).click()
  await expect(page).toHaveURL(/\/account\/comments\/\?type=product&status=pending$/)
  const pending = await liveComments(page, '?subject_type=product&status=pending')
  if (pending.count === 0) {
    await expect(
      page.getByRole('heading', { name: 'دیدگاهی با این فیلترها پیدا نشد' }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'نمایش همه' }).click()
    await expect(page).toHaveURL(/\/account\/comments\/$/)
  } else {
    await expect(rows(page)).toHaveCount(pending.results.length)
    await page.goto('/account/comments/')
  }
  const all = await liveComments(page)
  await expect(rows(page)).toHaveCount(all.results.length)
  // Back keeps the filters (they are the URL).
  await page.goBack()
  await expect(page).toHaveURL(/\?type=product&status=pending$/)
  expect(tried).toEqual([])
  expect(errors).toEqual([])
})

signedInTest(
  '«حذف دیدگاه» asks first, then the row goes (the delete answered here)',
  async ({ page }) => {
    const errors = watchErrors(page)
    const live = await liveComments(page)
    expect(live.results.length).toBeGreaterThan(1)
    const [, target, next] = live.results
    const served = { results: live.results, deletes: [] as string[] }
    await page.route(DELETE, (route) => {
      served.deletes.push(new URL(route.request().url()).pathname)
      served.results = served.results.filter(
        (row) => !(row.subject_type === target!.subject_type && row.id === target!.id),
      )
      return route.fulfill({ status: 204, body: '' })
    })
    await page.route(LIST, (route) =>
      route.fulfill({
        json: {
          msg: '',
          code: 200,
          data: { ...live, count: served.results.length, results: served.results },
        },
      }),
    )
    await page.route(SUMMARY, async (route) => {
      const response = await route.fetch()
      const json = (await response.json()) as { data: { comment_count: number } }
      json.data.comment_count = served.results.length
      await route.fulfill({ response, json })
    })
    await page.goto('/account/comments/')
    const row = list(page).getByRole('article', { name: target!.subject.name })
    const remove = row.getByRole('button', { name: /^حذف دیدگاه/ })

    await remove.click()
    const dialog = page.getByRole('dialog', { name: 'این دیدگاه حذف شود؟' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'انصراف' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(remove).toBeFocused()
    expect(served.deletes).toEqual([])

    await remove.click()
    await dialog.getByRole('button', { name: 'حذف دیدگاه' }).click()
    await expect(dialog).toBeHidden()
    await expect(rows(page)).toHaveCount(live.results.length - 1)
    await expect(toasts(page).getByText('دیدگاه حذف شد.')).toBeVisible()
    await expect(
      list(page)
        .getByRole('article', { name: next!.subject.name })
        .getByRole('heading', { level: 2 }),
    ).toBeFocused()
    expect(served.deletes).toEqual([
      `/api/bff/dashboard/comment/${target!.subject_type}/${target!.id}/delete/`,
    ])
    expect(errors).toEqual([])
    // A summary read still on its way is answered before the test ends (`settleRoutes`).
  },
)
