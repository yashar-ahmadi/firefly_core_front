import 'server-only'
import { getBlogCategories, getBlogCategory, getBlogHome, getBlogPosts } from '@/features/blog/api'
import { BlogUnavailableError } from '@/features/blog/blog-errors'
import type { BlogQuery } from '@/features/blog/blog-routes'
import { requestedCategoryPath } from '@/features/catalog/listing-routes'
import { getMenu } from '@/features/settings/api'
import { isApiNotFound } from '@/lib/api/errors'
import type {
  BlogCategoryDetail,
  BlogCategoryListItem,
  BlogHome,
  PostCard,
} from '@/lib/api/types/blog'
import type { Paginated } from '@/lib/api/types/common'
import type { MenuNode } from '@/lib/api/types/settings'

// What the blog's pages load (each loader is React-cached: `generateMetadata` and the page share
// one request of each). Wrap them in `loadBlog` (./availability.ts) for the blog switch.

/** The posts, or null for a page past the last (the API's 404): the page is then a 404. */
async function postsOrNull(
  query: Parameters<typeof getBlogPosts>[0],
): Promise<Paginated<PostCard> | null> {
  try {
    return await getBlogPosts(query)
  } catch (error) {
    if (isApiNotFound(error)) return null
    throw error
  }
}

/** The home's composition: secondary to the archive, so a failure leaves it out (logged). */
async function homeOrNull(): Promise<BlogHome | null> {
  try {
    return await getBlogHome()
  } catch (error) {
    if (error instanceof BlogUnavailableError) throw error
    console.error(
      '[blog] the home’s composition failed:',
      error instanceof Error ? error.name : error,
    )
    return null
  }
}

export interface BlogHomeData {
  posts: Paginated<PostCard> | null
  /** Only on the landing (page 1, no search). */
  home: BlogHome | null
  categories: BlogCategoryListItem[]
  menu: MenuNode[]
}

/** `/blog/`: the archive page asked for, and on the landing the home's composition, at once. */
export async function loadBlogHome(query: BlogQuery): Promise<BlogHomeData> {
  const landing = query.page === undefined && query.search === undefined
  const [posts, home, categories, menu] = await Promise.all([
    postsOrNull(query),
    landing ? homeOrNull() : null,
    getBlogCategories(),
    getMenu('blog-sidebar'),
  ])
  return { posts, home, categories, menu }
}

/**
 * A category page's category: by the URL's last segment, with the requested path in the API's
 * decoded form (to compare with its `path`); null when a segment cannot be a slug or the API has
 * no such published category. Checked before anything is listed (the post list ignores an
 * unknown category and lists every post).
 */
export async function loadBlogCategory(
  segments: string[],
): Promise<{ category: BlogCategoryDetail; requested: string } | null> {
  const requested = requestedCategoryPath(segments)
  if (requested === null) return null
  const category = await getBlogCategory(segments.at(-1) ?? '')
  return category === null ? null : { category, requested }
}

export interface BlogCategoryPosts {
  posts: Paginated<PostCard> | null
  categories: BlogCategoryListItem[]
  menu: MenuNode[]
}

/** The category's posts (its descendants' too: the API's own rule), and the sidebar's data. */
export async function loadBlogCategoryPosts(
  category: BlogCategoryDetail,
  page: number | undefined,
): Promise<BlogCategoryPosts> {
  const [posts, categories, menu] = await Promise.all([
    postsOrNull({ category: category.slug, ...(page === undefined ? {} : { page }) }),
    getBlogCategories(),
    getMenu('blog-sidebar'),
  ])
  return { posts, categories, menu }
}
