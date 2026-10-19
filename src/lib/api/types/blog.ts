/**
 * The blog's wire types (blog digest §1.2–1.6, §1.8–1.9). Pure types: safe in any bundle. Every
 * image is an absolute URL on the API host; datetimes are ISO-8601 with the Tehran offset.
 */
import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog/enums'

/** A category without its path (post cards, breadcrumbs): link it through the category list. */
export interface BlogCategoryLight {
  id: number
  name: string
  slug: string
  parent_id: number | null
}

export interface PostAuthor {
  /** The full name, or «کاربر» when the account has none. */
  full_name: string
  /** null: no picture (no placeholder). */
  avatar: string | null
}

/** One post as lists show it (`blog/home/`, `blog/post/list/`, search). Link: `/blog/{slug}/`. */
export interface PostCard {
  id: number
  name: string
  slug: string
  /** Plain text. */
  description: string | null
  /** 500×500, or the API's placeholder; never null. */
  image: string
  /** null when the author's account was deleted. */
  author: PostAuthor | null
  /** In assignment order; may be empty, and may hold a draft category (no page of its own). */
  categories: BlogCategoryLight[]
  comment_count: number
  question_count: number
  view_count: number
  /** Viewer-specific; false in every shared (anonymous) response. */
  is_in_reading_list: boolean
  /** First publication: the default sort key. */
  published_at: string | null
  created: string
  updated: string
}

/** The compact product card of the blog home's `recent_products`. Show `final_price`. */
export interface BlogProductCard {
  id: number
  name: string
  slug: string
  image: string
  in_stock: boolean
  /** Before the discount; null when the product has no variant. */
  price: number | null
  final_price: number | null
  has_discount: boolean
  discount_percent: number
  /** Viewer-specific; false for guests. */
  is_in_wishlist: boolean
}

/** `GET blog/home/`: each section may be empty (switched off by the operator). */
export interface BlogHome {
  /** 0 to 4 posts. */
  featured_posts: PostCard[]
  recent_posts: PostCard[]
  recent_products: BlogProductCard[]
}

/** One row of `GET blog/category/list/` (tree pre-order without `ordering`). */
export interface BlogCategoryListItem extends BlogCategoryLight {
  /** The slug chain root→self («tech-news/mobile-blog»): the page is `/blog/category/{path}/`. */
  path: string
  short_description: string | null
  image: string
  icon: string
  /** Published posts directly in it (descendants not counted). */
  post_count: number
  created: string
  updated: string
}

/** The category's `structured_data[0]`. Its URLs are on `https://{SITE_DOMAIN}`. */
export interface CollectionPageJsonLd {
  '@context': 'https://schema.org'
  '@type': 'CollectionPage'
  name: string
  description: string
  url: string
  isPartOf: { '@type': 'Blog'; name: string; url: string }
  publisher: {
    '@type': 'Organization'
    name: string
    logo: { '@type': 'ImageObject'; url: string }
  }
}

/** `GET blog/category/{slug}/`: 404 for a missing or draft category. No posts. */
export interface BlogCategoryDetail extends BlogCategoryLight {
  path: string
  short_description: string | null
  /** Plain text. */
  description: string | null
  /** Operator HTML, shown below the posts. */
  content: string | null
  image: string
  icon: string
  /** Root→self, self included; no paths (join the slugs). */
  breadcrumb: BlogCategoryLight[]
  /** The SEO title, else the name. */
  page_title: string
  /** "" when unset. */
  page_description: string
  page_keywords: string
  canonical_link: string | null
  structured_data: CollectionPageJsonLd[]
  breadcrumb_structured_data: BreadcrumbListJsonLd
  created: string
  updated: string
}

/** One saved post of `GET blog/reading-list/list/` (`is_in_reading_list` is always true). */
export interface ReadingListPost extends PostCard {
  added_at: string
}
