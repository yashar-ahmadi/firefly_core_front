import 'server-only'
import { cache } from 'react'
import { asBlogError, BlogUnavailableError } from '@/features/blog/blog-errors'
import { oneSegment, orRememberedNotFound, visitorIp } from '@/features/catalog/loaders/read'
import { ApiError } from '@/lib/api/errors'
import { apiFetch, type ApiFetchOptions } from '@/lib/api/server'
import type {
  BlogCategoryDetail,
  BlogCategoryListItem,
  BlogHome,
  PostCard,
} from '@/lib/api/types/blog'
import type { Paginated } from '@/lib/api/types/common'

/**
 * Server loaders of the public blog (blog digest §1.3–1.6, §1.11). Every read is anonymous (no
 * token, so one Data Cache entry serves everyone; the reading-list flags are filled in on the
 * client) and, like the catalog's, sends no visitor IP, except a search (its own cache entry,
 * charged to the visitor's own API rate limit). The home and the post list are cached 60 s like
 * catalog lists, the categories 300 s like the category tree. `cache()` dedupes the calls of
 * one render (`generateMetadata` plus the page).
 *
 * The blog switch turned off (`503 feature_disabled`) throws a `BlogUnavailableError` from
 * every loader; the pages show «وبلاگ موقتاً در دسترس نیست» for it (Review Focus #1).
 */

/** On every blog read: `revalidateTag('blog')` refreshes the whole blog. */
export const BLOG_TAG = 'blog'

const LIST_REVALIDATE = 60
const CATEGORY_REVALIDATE = 300
const CATEGORY_PAGE_SIZE = 100
/** A bound on a misbehaving `next` link: 2000 categories. */
const MAX_CATEGORY_PAGES = 20

type ReadOptions = Pick<ApiFetchOptions, 'query' | 'revalidate' | 'tags' | 'forwardedFor' | 'token'>

/**
 * One blog read: the envelope's `data`, or the failure, with the blog switch as a
 * `BlogUnavailableError`. For every blog loader (the post's too, Task 2).
 */
export async function blogRead<T>(path: string, options: ReadOptions): Promise<T> {
  try {
    const { data } = await apiFetch<T>(path, options)
    return data
  } catch (error) {
    throw asBlogError(error)
  }
}

/** `GET blog/home/`: featured, recent posts and recent products (each may be empty). */
export const getBlogHome = cache((): Promise<BlogHome> =>
  blogRead<BlogHome>('blog/home', {
    revalidate: LIST_REVALIDATE,
    tags: ['blog:home', BLOG_TAG],
  }),
)

/** What a blog listing asks the post list for (its own parameter names). */
export interface BlogPostsQuery {
  category?: string
  search?: string
  page?: number
}

const listPosts = cache(
  (search: string, forwardedFor: string | null): Promise<Paginated<PostCard>> =>
    blogRead<Paginated<PostCard>>('blog/post/list', {
      query: Object.fromEntries(new URLSearchParams(search)),
      revalidate: LIST_REVALIDATE,
      tags: [BLOG_TAG],
      forwardedFor,
    }),
)

/**
 * `GET blog/post/list/`. Equal queries share one request and one cache entry (one key order,
 * page 1 left out). A page past the last is `ApiError { status: 404 }` («صفحه نامعتبر»): the
 * page calls `notFound()`. An unknown category is no error here (the API ignores it and lists
 * everything): check it with `getBlogCategory` first.
 */
export async function getBlogPosts(q: BlogPostsQuery): Promise<Paginated<PostCard>> {
  const params = new URLSearchParams()
  if (q.category) params.set('category', q.category)
  if (q.search) params.set('search', q.search)
  if (q.page !== undefined && q.page > 1) params.set('page', String(q.page))
  return listPosts(params.toString(), q.search ? await visitorIp() : null)
}

function logFailure(loader: string, error: unknown): void {
  if (error instanceof ApiError) console.error(`[blog] ${loader} failed:`, error.status, error.code)
  else console.error(`[blog] ${loader} failed:`, error instanceof Error ? error.message : error)
}

/**
 * Every published category, in the API's tree pre-order (`GET blog/category/list/`, 100 at a
 * time, following `next`). For the chips, the sidebar and the cards' category links, never the
 * page's main content: any failure but the blog switch is an empty list, logged once.
 */
export const getBlogCategories = cache(async (): Promise<BlogCategoryListItem[]> => {
  const categories: BlogCategoryListItem[] = []
  try {
    for (let page = 1; page <= MAX_CATEGORY_PAGES; page++) {
      const data = await blogRead<Paginated<BlogCategoryListItem>>('blog/category/list', {
        query: { limit: CATEGORY_PAGE_SIZE, page },
        revalidate: CATEGORY_REVALIDATE,
        tags: [BLOG_TAG],
      })
      categories.push(...data.results)
      if (!data.next) return categories
    }
    console.warn(`[blog] getBlogCategories stopped after ${MAX_CATEGORY_PAGES} pages`)
    return categories
  } catch (error) {
    if (error instanceof BlogUnavailableError) throw error
    logFailure('getBlogCategories', error)
    return []
  }
})

/**
 * `GET blog/category/<slug>/` by the category's own (last) slug: null for a slug that cannot be
 * one segment, for `list` (routed to the list endpoint), or on the API's 404 (missing or draft;
 * remembered for a minute in process memory). Throws otherwise.
 */
export const getBlogCategory = cache(async (slug: string): Promise<BlogCategoryDetail | null> => {
  const segment = oneSegment(slug)
  if (segment === null || segment.text === 'list') return null
  const path = `blog/category/${segment.path}`
  return orRememberedNotFound(path, () =>
    blogRead<BlogCategoryDetail>(path, {
      revalidate: CATEGORY_REVALIDATE,
      tags: [`blog-category:${segment.text}`, BLOG_TAG],
    }),
  )
})
