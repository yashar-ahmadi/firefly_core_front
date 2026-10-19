import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { ReadingListPost } from '@/lib/api/types/blog'
import { shellHydrated } from '../support/hydrated'
import { shirinTest } from '../support/shirin'

// The reading list signed in, as shirin (ruling P4-R4: never sara for a write), in the
// `journeys` project (one at a time, after the read-only projects; her shared session there, no
// login of its own). Her reading list is snapshotted first and put back exactly in the fixture's
// teardown, through a request context of her own, however the test ends.
// - The bookmark (Plan 5 Task 1): one post saved and removed again from a card; each press is
//   one request (POST, then DELETE answered 204) and flips the bookmark at once. Writes: 2.
// - Her page `/account/reading-list/` (Task 2): a post saved for it, then filtered, sorted,
//   removed by its bookmark and brought back by «بازگردانی». Writes: 3 (save, remove, undo).
// Plus one per post the teardown has to put back (one, the page's post).

const BFF = { 'X-Requested-With': 'ff' }
const LIST = '/api/bff/blog/reading-list/list/?limit=100'
const toggle = (slug: string) => `/api/bff/blog/post/${encodeURIComponent(slug)}/reading-list/`

async function savedSlugs(request: APIRequestContext): Promise<string[]> {
  const response = await request.get(LIST, { headers: BFF })
  expect(response.ok(), `shirin's reading list: ${response.status()}`).toBe(true)
  const { data } = (await response.json()) as { data: Paginated<ReadingListPost> }
  return data.results.map((post) => post.slug)
}

interface ReadingListGuard {
  /** Her saved posts before the test. */
  before: string[]
  request: APIRequestContext
}

const test = shirinTest.extend<{ readingList: ReadingListGuard }>({
  readingList: [
    async ({ shirinState, playwright }, provide, info) => {
      const request = await playwright.request.newContext({
        baseURL: info.project.use.baseURL,
        storageState: shirinState,
      })
      try {
        const before = await savedSlugs(request)
        await provide({ before, request })
        // Put her list back exactly: what the test saved goes, what it removed comes back.
        const after = await savedSlugs(request)
        const restores = [
          ...after.filter((slug) => !before.includes(slug)).map((slug) => ['DELETE', slug]),
          ...before.filter((slug) => !after.includes(slug)).map((slug) => ['POST', slug]),
        ] as const
        for (const [method, slug] of restores) {
          const response = await request.fetch(toggle(slug), { method, headers: BFF })
          expect(response.ok(), `restoring ${slug}: ${response.status()}`).toBe(true)
        }
        info.annotations.push({ type: 'writes', description: `teardown: ${restores.length}` })
        // The same posts (a removed one put back is saved last: the order may differ).
        expect((await savedSlugs(request)).toSorted()).toEqual(before.toSorted())
      } finally {
        await request.dispose()
      }
    },
    { timeout: 60_000 },
  ],
})

/** The page's reading-list writes, as `METHOD slug`. */
function recordWrites(page: Page): string[] {
  const writes: string[] = []
  page.on('request', (request: Request) => {
    const match = /\/api\/bff\/blog\/post\/([^/]+)\/reading-list\/$/.exec(
      new URL(request.url()).pathname,
    )
    if (match && request.method() !== 'GET') {
      writes.push(`${request.method()} ${decodeURIComponent(match[1]!)}`)
    }
  })
  return writes
}

test('a bookmark saves a post at once with one request, and a second press removes it', async ({
  page,
  readingList,
}) => {
  const writes = recordWrites(page)
  // Her saved ids: the bookmarks know which way a press goes once they are in.
  const ids = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/bff/blog/reading-list/list/' && response.ok(),
  )
  await page.goto('/blog/?page=2')
  await shellHydrated(page)
  await ids
  const archive = page.getByRole('main').getByRole('region', { name: 'همه\u{0654} مطالب' })
  // The first card whose post is not in her list (the bookmarks fill in once her ids are read),
  // then that card by its post's link: a locator filtered by its button would move on once the
  // button changes.
  const unsaved = archive
    .getByRole('article')
    .filter({ has: page.getByRole('button', { name: 'افزودن به لیست مطالعه' }) })
    .first()
  await expect(unsaved.getByRole('button', { name: 'افزودن به لیست مطالعه' })).not.toHaveAttribute(
    'aria-disabled',
  )
  const href = await unsaved
    .getByRole('heading', { level: 3 })
    .getByRole('link')
    .getAttribute('href')
  const slug = decodeURIComponent(href!.split('/')[2]!)
  expect(readingList.before).not.toContain(slug)
  const card = archive.getByRole('article').filter({ has: page.locator(`a[href="${href}"]`) })
  const save = card.getByRole('button', { name: 'افزودن به لیست مطالعه' })

  await save.click()
  const remove = card.getByRole('button', { name: 'حذف از لیست مطالعه' })
  await expect(remove).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('مطلب به لیست مطالعه اضافه شد.')).toBeVisible()
  await expect.poll(() => savedSlugs(readingList.request)).toContain(slug)
  expect(writes).toEqual([`POST ${slug}`])

  await remove.click()
  await expect(card.getByRole('button', { name: 'افزودن به لیست مطالعه' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect.poll(() => savedSlugs(readingList.request)).not.toContain(slug)
  expect(writes).toEqual([`POST ${slug}`, `DELETE ${slug}`])
  test.info().annotations.push({ type: 'writes', description: `presses: ${writes.length}` })
})

test('her reading list page: filtered and sorted in the URL; a removal is undone', async ({
  page,
  readingList,
}) => {
  // A «سبک زندگی» post she has not saved, saved for the page (the fixture takes it out again).
  const slug = ['tea-brewing-guide', 'gift-guide-yalda', 'perfume-longevity-tips'].find(
    (candidate) => !readingList.before.includes(candidate),
  )!
  const saved = await readingList.request.fetch(toggle(slug), { method: 'POST', headers: BFF })
  expect(saved.ok()).toBe(true)
  const writes = recordWrites(page)

  await page.goto('/account/reading-list/')
  await shellHydrated(page)
  await expect(page).toHaveTitle(/^لیست مطالعه \| /)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const card = page.getByRole('article').filter({ has: page.locator(`a[href="/blog/${slug}/"]`) })
  await expect(card).toBeVisible()

  await page.getByRole('combobox', { name: 'مرتب\u{200C}سازی' }).selectOption('added-asc')
  await expect(page).toHaveURL(/\/account\/reading-list\/\?sort=added-asc$/)
  await page.getByRole('combobox', { name: 'دسته\u{200C}بندی' }).selectOption('lifestyle')
  await expect(page).toHaveURL(/\?category=lifestyle&sort=added-asc$/)
  await expect(card).toBeVisible()

  const remove = card.getByRole('button', { name: 'حذف از لیست مطالعه' })
  await expect(remove).toHaveAttribute('aria-pressed', 'true')
  await remove.click()
  await expect(card).toHaveCount(0)
  const toast = page.getByRole('button', { name: 'بازگردانی' })
  await toast.click()
  await expect(card).toBeVisible()
  expect(writes).toEqual([`DELETE ${slug}`, `POST ${slug}`])
  test.info().annotations.push({ type: 'writes', description: `page: ${writes.length + 1}` })
})
