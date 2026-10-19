/**
 * A blog post's page on the wire (blog digest §1.5, §1.7, §1.9): the detail, its comments and the
 * comment form's body. Pure types: safe in any bundle.
 */
import type { BlogCategoryLight, BlogProductCard, PostAuthor, PostCard } from './blog'
import type { BreadcrumbListJsonLd } from './catalog/enums'

/** A heading of the post's `content`, with the id the API put on its tag there. */
export interface ContentHeading {
  text: string
  /** Often Persian («چرا-بودجه-۳۰-میلیونی»); "" for a heading of punctuation only; repeated texts repeat it. */
  id: string
  /** 1–6: the tag's level in `content`. */
  level: number
  /** The outline's numbering («1», «1-2»), relative to the document. */
  number: string
}

/** The post's `structured_data[0]`. Its URLs are on `https://{SITE_DOMAIN}`. */
export interface BlogPostingJsonLd {
  '@context': 'https://schema.org'
  '@type': 'BlogPosting'
  mainEntityOfPage: { '@type': 'WebPage'; '@id': string }
  headline: string
  description: string
  image: string
  publisher: {
    '@type': 'Organization'
    name: string
    logo: { '@type': 'ImageObject'; url: string }
  }
  datePublished: string
  dateModified: string
  /** The post's raw HTML (digest bug #3). */
  articleBody: string
  author?: { '@type': 'Person'; name: string }
  commentCount?: number
  comment?: {
    '@type': 'Comment'
    author: { '@type': 'Person'; name: string }
    datePublished: string
    text: string
  }[]
}

/**
 * `GET blog/post/<slug>/`: 404 for a missing, draft or not-yet-due post (staff get it, with
 * `is_unpublished`). **Every call counts a view** (`view_count`), so a page view reads it once.
 */
export interface PostDetail {
  id: number
  name: string
  slug: string
  /** Plain text. */
  description: string | null
  /** The operator's HTML: `/media` absolute on the API host, storefront links relative, heading ids. */
  content: string | null
  headings: ContentHeading[]
  /** 500×500 (`og:image`); never null. */
  image: string
  /** The wide hero at its own size; null: no banner (never `image` instead). */
  banner: string | null
  author: PostAuthor | null
  categories: BlogCategoryLight[]
  /** Root→leaf of the post's deepest category, the leaf included; [] without one. */
  breadcrumb: BlogCategoryLight[]
  comment_count: number
  question_count: number
  view_count: number
  /** The viewer's own: the read carries their session. */
  is_in_reading_list: boolean
  related_posts: PostCard[]
  related_products: BlogProductCard[]
  /** The SEO title, else the name (no shop suffix added). */
  page_title: string
  /** "" when unset. */
  page_description: string
  page_keywords: string
  canonical_link: string | null
  /** Exactly one. */
  structured_data: BlogPostingJsonLd[]
  breadcrumb_structured_data: BreadcrumbListJsonLd
  /** A staff preview of a draft or a scheduled post: noindex, no sharing. */
  is_unpublished: boolean
  published_at: string | null
  created: string
  updated: string
}

// A post's comments have the shape every subject's comments have (subject-comment.ts).
export type {
  SubjectComment as BlogComment,
  SubjectCommentSubmitBody as BlogCommentSubmitBody,
  SubjectCommentType as BlogCommentType,
} from '@/lib/api/types/subject-comment'
