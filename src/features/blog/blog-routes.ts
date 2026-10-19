/**
 * The blog's storefront URLs (blog digest §1.10, `subject-links.ts`) and its archive query.
 * Pure and small: the search results import it, so nothing else of the blog reaches them.
 */
import { parseListingParams } from '@/features/catalog/listing-params'

type RawParams = Record<string, string | string[] | undefined>

/** `/blog/<slug>/`, a post: never prefetched (ruling P5-R1, `@/lib/links/post-link`). */
export { blogPostPath } from '@/lib/links/post-link'

/** The blog home and archive. */
export const BLOG_PATH = '/blog/'

/** `/blog/category/<path>/` from the category's `path` («tech-news/mobile-blog»). */
export function blogCategoryPath(path: string): string {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `/blog/category/${encoded}/`
}

/** What the archive's URL asks for: a later page, a search term. Defaults are left out. */
export interface BlogQuery {
  page?: number
  search?: string
}

/**
 * The archive's `?page=` and `?search=` (the post list's own parameter names). Never throws:
 * a page that is not a whole number of at least 1 (`abc`, `0`, `-2`, `1.5`) is page 1, a blank
 * search is none, a long one is cut to 200 characters, and every other key is ignored. Persian
 * digits are read as digits.
 */
export function parseBlogQuery(sp: RawParams): BlogQuery {
  const { page, search } = parseListingParams({ page: sp.page, search: sp.search })
  return {
    ...(page !== undefined && page > 1 ? { page } : {}),
    ...(search ? { search } : {}),
  }
}

/** A blog listing's URL (`base`: the home or a category page) for `query`, defaults omitted. */
export function blogListingHref(base: string, query: BlogQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.page !== undefined && query.page > 1) params.set('page', String(query.page))
  const search = params.toString()
  return search ? `${base}?${search}` : base
}

/** The archive's search results: the search results' «مشاهدهٔ همه» for posts. */
export function blogSearchHref(term: string): string {
  return blogListingHref(BLOG_PATH, { search: term })
}
