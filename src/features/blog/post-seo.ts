import type { Metadata } from 'next'
import { isPlaceholderImage } from '@/components/layout/menu-tree'
import { canonicalFor } from '@/features/seo/canonical'
import { metaExcerpt, seoMetadata } from '@/features/seo/metadata'
import type { PostDetail } from '@/lib/api/types/blog-post'
import { blogPostPath } from '@/lib/links/post-link'

// A post's <head> and structured data (blog digest §1.9, seo digest §7). Pure.

/**
 * The canonical: the operator's `canonical_link` (a path or a URL on this shop given its trailing
 * slash; another site's as written), else the post's own path (`canonicalFor`). Pure.
 */
export function postCanonical(post: Pick<PostDetail, 'slug' | 'canonical_link'>, siteUrl: string) {
  return canonicalFor(post.canonical_link, blogPostPath(post.slug), siteUrl)
}

/**
 * A post's head: `page_title` as an absolute title (it often names the shop already), the
 * description (`page_description`, "" meaning unset: else the short description or the text),
 * keywords, the canonical (`postCanonical`), Open Graph `article` with the post's picture (not
 * the API's placeholder: no picture to share), its dates, author and first category, and the
 * operator's meta rows (M-13). A staff preview of an unpublished post is never indexed.
 */
export function postMetadata(post: PostDetail, shop: string, siteUrl: string): Metadata {
  const meta = seoMetadata({
    pageTitle: post.page_title,
    description: post.page_description,
    fallbackDescription: metaExcerpt(post.description, post.content),
    keywords: post.page_keywords,
    canonical: postCanonical(post, siteUrl),
    path: blogPostPath(post.slug),
    image: isPlaceholderImage(post.image) ? null : post.image,
    siteName: shop,
    metaTags: post.meta_tags,
    robots: post.is_unpublished ? { index: false, follow: false } : null,
  })
  // A field the operator wrote as a meta row is theirs: ours is left out (one tag each).
  const given = new Set((post.meta_tags ?? []).map((tag) => tag.field.trim().toLowerCase()))
  const ours = <T>(field: string, value: T | null | undefined) =>
    value === null || value === undefined || given.has(field) ? {} : value
  const section = post.categories[0]?.name
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      ...ours('og:type', { type: 'article' as const }),
      ...ours('article:published_time', post.published_at && { publishedTime: post.published_at }),
      ...ours('article:modified_time', { modifiedTime: post.updated }),
      ...ours('article:author', post.author && { authors: [post.author.full_name] }),
      ...ours('article:section', section && { section }),
    },
  }
}

/**
 * A post's JSON-LD: the backend's BlogPosting and BreadcrumbList as they come (pages on
 * `STOREFRONT_URL`, pictures on `PUBLIC_FILES_ORIGIN`, M-12; the text as `articleBody`, no
 * empty logo, «وبلاگ»: J-20, J-37, J-5). Written escaped by `JsonLd`.
 */
export function postJsonLd(post: PostDetail): object[] {
  return [...post.structured_data, post.breadcrumb_structured_data]
}
