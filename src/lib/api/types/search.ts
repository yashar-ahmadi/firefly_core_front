/**
 * `GET search/?q=` and `GET search/suggest/?q=` (content digest §2 and §7). Pure types.
 * `search/` is logged by the backend on every call: never cache it.
 */
import type { BrandCard, CategoryCard, PostCard, ProductCard } from '@/lib/api/types/catalog'

/** A static page card (also `GET pages/list/`). */
export interface PageCard {
  id: number
  title: string
  slug: string
  /** "/page/{slug}/". */
  url: string
  description: string | null
}

export interface SearchGroup<T> {
  /** Equals the count of the group's list endpoint called with `listing_query`. */
  count: number
  /** The top results, re-ranked; compare with `count` instead of hard-coding the cap. */
  items: T[]
  /** Query for the group's "see all" page; null only for `blog_posts` while the blog is off. */
  listing_query: Record<string, string> | null
}

export interface SearchResults {
  /** The normalised term actually searched: show this, not the raw input. */
  query: string
  /** Sum of the group counts (the blog excluded while it is off). */
  total: number
  /** `listing_query` always carries `special_first: 'false'`. */
  products: SearchGroup<ProductCard>
  product_categories: SearchGroup<CategoryCard>
  brands: SearchGroup<BrandCard>
  blog_posts: SearchGroup<PostCard>
  pages: SearchGroup<PageCard>
}

export interface SearchSuggestion {
  id: number
  name: string
  /** A ready storefront path. */
  url: string
  image: string
}

/** Never logged. Empty arrays mean "draw nothing". */
export interface SearchSuggestions {
  query: string
  /** ≤ 5. */
  products: SearchSuggestion[]
  /** ≤ 3. */
  product_categories: SearchSuggestion[]
  /** ≤ 3. */
  brands: SearchSuggestion[]
}
