import type { MetaTag } from '@/lib/api/types/catalog'
import type { PageCard } from '@/lib/api/types/search'

// A content page (`GET pages/<slug>/`, content digest §2, §3.2). Pure types.

export type { PageCard }

/** The operator's choice of layout; the storefront renders anything else as `default`. */
export type PageLayout = 'default' | 'full_width' | 'with_sidebar'

export interface PageDetail extends PageCard {
  /** A `PageLayout` (an unknown value is read as `default`: `pageLayout()`). */
  layout: string
  /** Trusted operator HTML (sanitised all the same); null when the page has none. */
  content: string | null
  /** The comment form is open. Old approved comments stay listed when it is not. */
  enable_comments: boolean
  /** Approved root comments and questions: the tabs' counts. */
  comment_count: number
  question_count: number
  /** Never empty: the SEO title, else the page's title. */
  page_title: string
  /** The SEO description, else `description`, else "". */
  page_description: string
  /** "" when unset. */
  page_keywords: string
  /** Absolute; null: the page's own URL. */
  canonical_link: string | null
  /** In the operator's order; a field may repeat (two `og:image`). */
  meta_tags: MetaTag[]
  /** True only in a staff preview of a draft (a staff token): noindex, never cached. */
  is_unpublished: boolean
  created: string
  updated: string
}
