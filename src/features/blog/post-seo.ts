import type { Metadata } from 'next'
import { isPlaceholderImage } from '@/components/layout/menu-tree'
import { blogBreadcrumb, blogStructuredData } from '@/features/blog/blog-structured-data'
import { canonicalFor } from '@/features/seo/canonical'
import { metaExcerpt, seoMetadata } from '@/features/seo/metadata'
import { mediaOnSite } from '@/features/seo/site-media'
import type { BlogPostingJsonLd, PostDetail } from '@/lib/api/types/blog-post'
import { htmlToText } from '@/lib/html/to-text'
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
 * the API's placeholder: no picture to share; on the shop's origin, as in the structured data:
 * `mediaOnSite`), its dates, author and first category. A staff
 * preview of an unpublished post is never indexed.
 */
export function postMetadata(post: PostDetail, shop: string, siteUrl: string): Metadata {
  const meta = seoMetadata({
    pageTitle: post.page_title,
    description: post.page_description,
    fallbackDescription: metaExcerpt(post.description, post.content),
    keywords: post.page_keywords,
    canonical: postCanonical(post, siteUrl),
    path: blogPostPath(post.slug),
    image: isPlaceholderImage(post.image) ? null : mediaOnSite(post.image, siteUrl),
    siteName: shop,
  })
  const section = post.categories[0]?.name
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      type: 'article',
      ...(post.published_at ? { publishedTime: post.published_at } : {}),
      modifiedTime: post.updated,
      ...(post.author ? { authors: [post.author.full_name] } : {}),
      ...(section ? { section } : {}),
    },
    ...(post.is_unpublished ? { robots: { index: false, follow: false } } : {}),
  }
}

/**
 * A post's JSON-LD: the backend's BlogPosting and BreadcrumbList set right for the shop
 * (blog-structured-data.ts: every URL on the storefront's origin, no empty one, «وبلاگ»), and
 * `articleBody` as plain text (the API sends the raw HTML: digest bug #3). Written escaped by
 * `JsonLd`.
 */
export function postJsonLd(post: PostDetail, siteUrl: string): object[] {
  const origin = new URL(siteUrl).origin
  const postings = post.structured_data.map((item) => {
    const moved = blogStructuredData(item, origin) as BlogPostingJsonLd
    return { ...moved, articleBody: htmlToText(item.articleBody) }
  })
  return [...postings, blogBreadcrumb(post.breadcrumb_structured_data, siteUrl)]
}
