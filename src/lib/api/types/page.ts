import type { MetaTag } from '@/lib/api/types/catalog'
import type { OperatorLink } from '@/lib/api/types/display'
import type { PageCard } from '@/lib/api/types/search'

// A content page (`GET pages/<slug>/`, content digest §2, §3.2). Pure types.

export type { PageCard }

/** The operator's choice of layout; the storefront renders anything else as `default`. */
export type PageLayout = 'default' | 'full_width' | 'with_sidebar'

/** The eleven block types (content digest §2, «بلوک‌های صفحه»); another is never drawn. */
export type PageBlockType =
  | 'slider'
  | 'banners'
  | 'gallery'
  | 'cards'
  | 'stats'
  | 'testimonials'
  | 'faq'
  | 'video'
  | 'call_to_action'
  | 'rich_text'
  | 'contact_info'

/** Where a block is drawn: between the title and `content`, or after it (before the comments). */
export type BlockPlacement = 'before_content' | 'after_content'

/**
 * One slide, banner, gallery picture, card, stat, testimonial or question. Every key is always
 * there; the ones the block's type does not read are null, a text it reads but the operator left
 * blank is "". Only active, complete items are sent.
 */
export interface PageBlockItem {
  id: number
  /** A slide's or card's title, a stat's label, a reviewer's name, a question, a caption. */
  title: string | null
  /** `testimonials` only: the reviewer's role. */
  subtitle: string | null
  /** Plain text: a slide's or card's text, a testimonial's quote, an answer. */
  description: string | null
  /** `stats` only: the figure as the operator wrote it («۲۵۰۰۰+»). */
  value: string | null
  /** Absolute; null when there is none. */
  image: string | null
  /** A slide's or banner's picture for phones; null: `image` there too. */
  mobile_image: string | null
  /** A card's or stat's small icon (SVG or a picture), absolute; null when none. */
  icon: string | null
  alt: string | null
  link: OperatorLink | null
}

/**
 * One optional block of a page: thirteen keys for every type; the ones the type does not read
 * are null (`items` null for a type without items). A block that cannot draw is never sent.
 */
export interface PageBlock {
  id: number
  /** A `PageBlockType`; an unknown one is not drawn. */
  type: string
  /** A `DisplayStyle` (read through `displayStyle()`: an unknown one is `style_1`). */
  style: string
  /** A `BlockPlacement`; anything else is drawn after the content, the panel's default. */
  placement: string
  /** Every type reads it; "" means none (a call to action always has one). */
  title: string
  /** null for `banners` and `rich_text`. */
  subtitle: string | null
  /** `rich_text` only: trusted operator HTML, `/media` absolute (sanitised all the same). */
  content: string | null
  /** A call to action's background, a video's cover; absolute. */
  image: string | null
  mobile_image: string | null
  alt: string | null
  /** `video` only: the https page of a video (Aparat, YouTube…), not an embed. */
  video_url: string | null
  /** A call to action's button (always there), else the block's «مشاهدهٔ همه». */
  link: OperatorLink | null
  /** In order; null for a type without items, never [] for one with them. */
  items: PageBlockItem[] | null
}

export interface PageDetail extends PageCard {
  /** A `PageLayout` (an unknown value is read as `default`: `pageLayout()`). */
  layout: string
  /** Trusted operator HTML (sanitised all the same); null when the page has none. */
  content: string | null
  /** The optional blocks, in drawing order: every `before_content`, then every `after_content`. */
  blocks: PageBlock[]
  /** The comment form is open. Old approved comments stay listed when it is not. */
  enable_comments: boolean
  /**
   * The tabs' counts: visible comments, and visible questions, each with their replies at any
   * depth (approved, not withdrawn, under no hidden parent). Not the list's `count` (root threads).
   */
  comment_count: number
  question_count: number
  /** Never empty: the SEO title, else the page's title. */
  page_title: string
  /** The SEO description, else an excerpt of `content`, else "". */
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
