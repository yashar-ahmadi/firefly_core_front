'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { categoryLinks } from '@/features/blog/blog-categories'
import { PostGrid } from '@/features/blog/components/post-grid'
import { READING_LIST_TOGGLE_KEY, toggleReadingListOnce } from '@/features/blog/reading-list'
import { useFeature } from '@/features/settings/feature-context'
import type { BlogCategoryListItem, ReadingListPost } from '@/lib/api/types/blog'
import { blogPostPath } from '@/lib/links/post-link'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { AccountPageHeader } from '../layout/account-page-header'
import { ListError } from '../lists/list-error'
import { useListRemovals } from '../lists/use-list-removals'
import { useListUrl } from '../lists/use-list-url'
import { usePageFallback } from '../lists/use-page-fallback'
import { isLoadingSection } from '../use-account-query'
import {
  categoryOptions,
  parseReadingListParams,
  readingListSearch,
  type ReadingListParams,
} from './reading-list-params'
import type { ReadingListStates } from './reading-list-states'
import { ReadingListToolbar } from './reading-list-toolbar'
import {
  fetchReadingListPage,
  readingListPageKey,
  useReadingListPage,
} from './use-reading-list-page'

export const READING_LIST_PATH = '/account/reading-list/'

/** The title link of `slug`'s card: what a card's focus moves to. */
function cardLink(grid: HTMLElement | null, slug: string): HTMLElement | null {
  return grid?.querySelector<HTMLElement>(`article h3 a[href="${blogPostPath(slug)}"]`) ?? null
}

function CardsSkeleton() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-card bg-white p-3 shadow-card">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export interface ReadingListPageProps {
  title: string
  /** The blog's published categories (the filter's options, the cards' category links). */
  categories: BlogCategoryListItem[]
  /** Its empty and unavailable states, rendered by the server page (`readingListStates`). */
  states: ReadingListStates
}

/**
 * `/account/reading-list/` «لیست مطالعه» (blog digest §1.8): the saved posts as the blog's own
 * cards (their bookmark removes), searched, filtered by a blog category (its descendants too) and
 * sorted by when they were saved, with pages: all of it in the URL, shallow (`useListUrl`), an
 * unknown category or sort never sent. A bookmark pressed here takes its card out once the DELETE
 * (204) succeeded, with «بازگردانی» (`useListRemovals`, as the wishlist); the account's badge is
 * read again after every write (the toggle's). A page past the end goes to the last one; a
 * failed read shows «تلاش دوباره» (a 429 waits its `retry_after`). While the blog is switched
 * off the API refuses the list itself, so the page says «وبلاگ موقتاً در دسترس نیست» with the
 * operator's reason and reads nothing (the wallet's read-only view has data to show; this has
 * none).
 */
export function ReadingListPage({ title, categories, states }: ReadingListPageProps) {
  const url = useListUrl(READING_LIST_PATH, parseReadingListParams, readingListSearch)
  const options = useMemo(() => categoryOptions(categories), [categories])
  const links = useMemo(() => categoryLinks(categories), [categories])
  // A category the blog does not have (any more) is no filter: never sent, never shown.
  const params: ReadingListParams = options.some((option) => option.value === url.params.category)
    ? url.params
    : { ...url.params, category: null }
  const blog = useFeature('blog')
  const client = useQueryClient()
  const { hasSession } = useSession()
  const { push } = useRouter()
  const expire = useSessionExpired()
  const query = useReadingListPage(params, blog.enabled)
  const heading = useRef<HTMLHeadingElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const goToPage = (page: number) => url.replace({ ...params, page })
  const leaving = usePageFallback({
    error: query.error,
    page: params.page,
    readFirst: () => {
      const first = { ...params, page: 1 }
      return client.fetchQuery({
        queryKey: readingListPageKey(first),
        queryFn: ({ signal }) => fetchReadingListPage(first, signal),
      })
    },
    goTo: goToPage,
  })
  const data = query.data
  const posts = useListRemovals<ReadingListPost>({
    results: data?.results ?? [],
    page: params.page,
    grid,
    pageHeading: heading,
    goToPage,
    reading: query.isFetching,
    mutationKey: READING_LIST_TOGGLE_KEY,
    cardLink,
    restore: (post) =>
      void toggleReadingListOnce(
        client,
        { hasSession, push, expire },
        { id: post.id, slug: post.slug, save: true },
      ),
    removedMessage: (post) => `«${post.name}» از لیست مطالعه حذف شد.`,
  })
  const filtered = params.search !== '' || params.category !== null
  const emptied = posts.length === 0 && params.page > 1

  let body
  if (!blog.enabled) {
    body = states.unavailable
  } else if (query.isError && !data && !leaving && !isLoadingSection(query)) {
    body = (
      <ListError
        message="لیست مطالعه بارگذاری نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (!data || leaving || emptied) {
    body = <CardsSkeleton />
  } else if (posts.length === 0 && !filtered) {
    body = states.empty
  } else if (posts.length === 0) {
    body = states.noMatch
  } else {
    body = (
      <>
        <div
          ref={grid}
          aria-busy={query.isPlaceholderData || undefined}
          className="transition-opacity aria-busy:opacity-60"
        >
          <PostGrid posts={posts} categoryLinks={links} label={title} priorityCount={0} />
        </div>
        <Pagination
          page={data.current_page}
          totalPages={data.total_pages}
          hrefFor={(page) => url.href({ ...params, page })}
          onFollow={url.followPage}
          className="mt-6"
        />
      </>
    )
  }

  return (
    <>
      <AccountPageHeader title={title} headingRef={heading} />
      {blog.enabled && (
        <ReadingListToolbar
          path={READING_LIST_PATH}
          params={params}
          categories={options}
          count={data?.count}
          onFilter={url.replace}
          onSearch={url.push}
        />
      )}
      {body}
    </>
  )
}
