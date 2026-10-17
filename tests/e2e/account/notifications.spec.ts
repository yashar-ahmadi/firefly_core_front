import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { NotificationItem } from '@/lib/api/types/notification'
import { signedInTest } from '../support/session'
import { watchErrors } from '../support/watch-errors'

// «اعلان‌ها» against the dev backend (Plan 3 Task 9), with the project's shared session
// (`signedInTest`). Reading is live; marking read cannot be undone (the API has no unread, digest
// §4.2), so every read request is answered here and never reaches the API, and no device request
// does either. The dev environment has no Firebase config: no push switch, no worker registered.

const READ = /\/api\/bff\/notification\/\d+\/read\/$/
const DEVICES = /\/api\/bff\/devices\//

/** Answers every read here and refuses every device call; returns what was tried. */
async function guardWrites(page: Page) {
  const reads: string[] = []
  const devices: string[] = []
  await page.route(READ, (route) => {
    reads.push(new URL(route.request().url()).pathname)
    return route.fulfill({ json: { msg: 'نوتیفیکیشن خوانده شد.', code: 200, data: {} } })
  })
  await page.route(DEVICES, (route) => {
    devices.push(`${route.request().method()} ${route.request().url()}`)
    return route.abort()
  })
  return { reads, devices }
}

/** sara's inbox as the API has it (the first 100). */
async function liveInbox(page: Page): Promise<NotificationItem[]> {
  const response = await page.request.get('/api/bff/notification/list/?limit=100', {
    headers: { 'X-Requested-With': 'ff' },
  })
  expect(response.ok(), 'notification/list/ through the BFF').toBe(true)
  return ((await response.json()) as { data: Paginated<NotificationItem> }).data.results
}

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

const list = (page: Page) => page.getByRole('list', { name: 'اعلان‌ها' })
const rowButton = (page: Page, item: NotificationItem) =>
  list(page).getByRole('button', {
    name: item.is_read ? item.title : `${item.title} خوانده‌نشده`,
    exact: true,
  })
const toPersian = (value: number) => value.toLocaleString('fa-IR', { useGrouping: false })

signedInTest('shows sara’s inbox: unread marked, the count, no web push here', async ({ page }) => {
  const errors = watchErrors(page)
  const tried = await guardWrites(page)
  const response = await page.goto('/account/notifications/')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page).toHaveTitle(/^اعلان‌ها \| /)
  await expect(page.getByRole('heading', { level: 1, name: 'اعلان‌ها' })).toBeVisible()

  const live = await liveInbox(page)
  await expect(list(page).getByRole('article')).toHaveCount(live.length)
  for (const item of live) {
    await expect(rowButton(page, item)).toHaveAttribute('aria-expanded', 'false')
  }
  const unread = live.filter((item) => !item.is_read).length
  await expect(
    page.getByText(
      unread === 0 ? 'همهٔ اعلان‌ها خوانده شده است.' : `${toPersian(unread)} اعلان خوانده‌نشده`,
      { exact: true },
    ),
  ).toBeVisible()
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(
      page
        .getByRole('navigation', { name: 'حساب کاربری' })
        .getByRole('link', { name: /^اعلان‌ها/ }),
    ).toHaveAttribute('aria-current', 'page')
  }
  // No Firebase config here: no switch, no worker, no Firebase code.
  await expect(page.getByRole('switch')).toHaveCount(0)
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0)
  const width = page.viewportSize()?.width ?? 0
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  for (const button of await page.getByRole('main').getByRole('button').all()) {
    if (!(await button.isVisible())) continue
    expect(await targetHeight(button), await button.innerText()).toBeGreaterThanOrEqual(44)
  }
  expect(tried).toEqual({ reads: [], devices: [] })
  expect(errors).toEqual([])
})

signedInTest(
  'opening a notification shows all of it; an unread one is marked read (answered here)',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await guardWrites(page)
    await page.goto('/account/notifications/')
    const live = await liveInbox(page)
    await expect(list(page).getByRole('article')).toHaveCount(live.length)

    const read = live.find((item) => item.is_read)
    if (read) {
      await rowButton(page, read).click()
      await expect(rowButton(page, read)).toHaveAttribute('aria-expanded', 'true')
      // The keyboard closes it again.
      await rowButton(page, read).press('Enter')
      await expect(rowButton(page, read)).toHaveAttribute('aria-expanded', 'false')
    }
    const unread = live.find((item) => !item.is_read)
    if (unread) {
      await rowButton(page, unread).click()
      const opened = rowButton(page, { ...unread, is_read: true })
      await expect(opened).toHaveAttribute('aria-expanded', 'true')
      const body = page.locator(`[id="${await opened.getAttribute('aria-controls')}"]`)
      await expect(body).toContainText(unread.body.split('\n')[0]!)
      await expect.poll(() => tried.reads).toEqual([`/api/bff/notification/${unread.id}/read/`])
    }
    expect(tried.reads).toEqual(unread ? [`/api/bff/notification/${unread.id}/read/`] : [])
    expect(tried.devices).toEqual([])
    expect(errors).toEqual([])
  },
)

signedInTest(
  '«علامت‌گذاری همه» sends one read per unread notification (answered here)',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await guardWrites(page)
    await page.goto('/account/notifications/')
    const unread = (await liveInbox(page)).filter((item) => !item.is_read)
    const button = page.getByRole('button', { name: /^علامت‌گذاری همه به‌عنوان خوانده‌شده/ })
    if (unread.length === 0) {
      await expect(button).toBeDisabled()
    } else {
      await expect(button).toBeEnabled()
      await button.click()
      await expect
        .poll(() => tried.reads)
        .toEqual(unread.map((item) => `/api/bff/notification/${item.id}/read/`))
    }
    expect(tried.devices).toEqual([])
    expect(errors).toEqual([])
  },
)

test('/sw.js is the site’s worker, with the headers a service worker needs', async ({
  request,
}) => {
  const response = await request.get('/sw.js', { maxRedirects: 0 })
  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['content-type']).toBe('application/javascript; charset=utf-8')
  expect(headers['service-worker-allowed']).toBe('/')
  expect(headers['cache-control']).toBe('no-cache')
  const source = await response.text()
  expect(source).toContain("self.addEventListener('push'")
  expect(source).toContain("self.addEventListener('notificationclick'")
})

signedInTest(
  'the unread count shows on any account page, before a visit to the inbox',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await guardWrites(page)
    await page.goto('/account/')
    await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
    const unread = (await liveInbox(page)).filter((item) => !item.is_read).length
    // The sidebar from lg, the dashboard's hub below it: «اعلان‌ها» with its badge either way.
    const inbox = page
      .getByRole('navigation', { name: 'حساب کاربری' })
      .getByRole('link', { name: /^اعلان‌ها/ })
    // (The browser spaces the label and the badge's words apart: «اعلان‌ها ، …».)
    await expect(inbox).toHaveAccessibleName(
      unread === 0
        ? 'اعلان‌ها'
        : new RegExp(`^اعلان‌ها\\s*، ${toPersian(unread)} اعلان خوانده‌نشده$`),
    )
    expect(tried).toEqual({ reads: [], devices: [] })
    expect(errors).toEqual([])
  },
)
