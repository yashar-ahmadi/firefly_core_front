import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReadingListPage } from '@/features/account/reading-list/reading-list-page'
import { readingListStates } from '@/features/account/reading-list/reading-list-states'
import type { FeatureMap } from '@/features/settings/feature-context'
import type { QueryInit } from '@/lib/api/envelope'
import { ApiError } from '@/lib/api/errors'
import type { ReadingListPost } from '@/lib/api/types/blog'
import type { Paginated } from '@/lib/api/types/common'
import { toPersianDigits } from '@/lib/format'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { SARA } from '../auth/fixtures'
import { categoryListItem, postFixture } from '../blog/fixtures'
import { authProviders } from '../support/auth-providers'

// The reading list page's tests share its data: saved posts, the blog's categories, its list
// pages and how the page is rendered.

export const READING_LIST = 'blog/reading-list/list/'

export const CATEGORIES = [
  categoryListItem(10001, 'tech-news', null, 'اخبار فناوری'),
  categoryListItem(10006, 'tech-news/mobile-blog', 10001, 'گوشی و موبایل'),
  categoryListItem(10002, 'buying-guide', null, 'راهنمای خرید'),
]

/** A saved post as the reading list answers it. */
export function savedPost(id: number, changes: Partial<ReadingListPost> = {}): ReadingListPost {
  return {
    ...postFixture({ id, slug: `post-${id}`, name: `مطلب ${toPersianDigits(id)}` }),
    is_in_reading_list: true,
    added_at: '2026-10-01T10:00:00+03:30',
    ...changes,
  }
}

export function listPage(
  results: ReadingListPost[],
  { count = results.length, page = 1, totalPages = 1 } = {},
): Paginated<ReadingListPost> {
  const data = { count, total_pages: totalPages, current_page: page, page_size: 12 }
  return { ...data, next: null, previous: null, results }
}

/** A 404 as the API answers a page past the end. */
export const pastTheEnd = () =>
  ApiError.fromBody(404, {
    data: { errors: [{ code: 'not_found', detail: 'صفحه نامعتبر', attr: null }] },
  })

/** A query of the page's list (not the bookmarks' `limit=100` ids). */
export const isPageQuery = (query: QueryInit | undefined) => query?.limit !== 100

/** The page signed in as sara (the blog's switch as given); `retry: false` shows a failure at once. */
export function renderReadingList({ features = {} as Partial<FeatureMap> } = {}) {
  const providers = authProviders({ hasSession: true, features })
  providers.client.setQueryData(ME_KEY, SARA)
  providers.client.setQueryDefaults(['reading-list'], { retry: false })
  const user = userEvent.setup()
  const view = render(
    <ReadingListPage title="لیست مطالعه" categories={CATEGORIES} states={readingListStates()} />,
    { wrapper: providers.wrapper },
  )
  return { user, client: providers.client, ...view }
}
