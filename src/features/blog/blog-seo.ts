import type { Metadata } from 'next'
import { isPlaceholderImage } from '@/components/layout/menu-tree'
import { BLOG_PATH, blogCategoryPath, type BlogQuery } from '@/features/blog/blog-routes'
import { listingIndexing } from '@/features/catalog/listing-routes'
import { trailBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { metaExcerpt, seoMetadata } from '@/features/seo/metadata'
import type { BlogCategoryDetail } from '@/lib/api/types/blog'
import { toPersianDigits } from '@/lib/format'
import { BLOG_NAME, BLOG_UNAVAILABLE_TITLE } from '@/features/blog/blog-copy'

// The blog pages' <head> and structured data (blog digest §1.9, seo digest §7). Pure.

type RawParams = Record<string, string | string[] | undefined>

export { BLOG_NAME, BLOG_UNAVAILABLE_TITLE } from '@/features/blog/blog-copy'

/** The home's title: the search, or «وبلاگ» (with its page), and the shop's name. */
function homeTitle(query: BlogQuery, shop: string): string {
  if (query.search) return `جستجوی «${query.search}» در ${BLOG_NAME} | ${shop}`
  const page = query.page ?? 1
  return page > 1
    ? `${BLOG_NAME} - صفحه\u{0654} ${toPersianDigits(page)} | ${shop}`
    : `${BLOG_NAME} | ${shop}`
}

/**
 * `/blog/`'s head (the API has no SEO fields for it): an absolute title naming the shop, set on
 * the social cards too; a later page is its own canonical (`?page=N`), a search or any other
 * parameter `noindex, follow` without a canonical, as the catalog's listings.
 */
export function blogHomeMetadata(sp: RawParams, query: BlogQuery, shop: string): Metadata {
  return seoMetadata({
    pageTitle: homeTitle(query, shop),
    description: `تازه‌ترین مطالب، راهنماهای خرید و بررسی‌های ${shop}`,
    path: BLOG_PATH,
    siteName: shop,
    ...listingIndexing(sp, { path: BLOG_PATH }),
    page: undefined,
  })
}

/**
 * A category page's head from its SEO fields: `page_title` as an absolute title (it often names
 * the shop already: Plan 2's rule) with «- صفحهٔ N» on a later page, the description (else the
 * short description, description or content), keywords, the canonical (`canonical_link`, else
 * the path; a later page its own), the picture unless it is the API's placeholder, and the
 * operator's meta rows (M-13).
 */
export function blogCategoryMetadata(
  category: BlogCategoryDetail,
  sp: RawParams,
  shop: string,
): Metadata {
  const path = blogCategoryPath(category.path)
  return seoMetadata({
    pageTitle: category.page_title,
    description: category.page_description,
    fallbackDescription: metaExcerpt(
      category.short_description,
      category.description,
      category.content,
    ),
    keywords: category.page_keywords,
    image: isPlaceholderImage(category.image) ? null : category.image,
    path,
    siteName: shop,
    metaTags: category.meta_tags,
    ...listingIndexing(sp, { path, canonicalLink: category.canonical_link }),
  })
}

/** «وبلاگ موقتاً در دسترس نیست | shop», never indexed (it answers 503). */
export function blogUnavailableMetadata(shop: string): Metadata {
  return {
    title: { absolute: `${BLOG_UNAVAILABLE_TITLE} | ${shop}` },
    robots: { index: false, follow: false },
  }
}

/** The blog home's JSON-LD (the API sends none): «خانه» › «وبلاگ», and the Blog itself. */
export function blogHomeJsonLd(siteUrl: string, shop: string): object[] {
  const url = new URL(BLOG_PATH, new URL(siteUrl).origin).href
  return [
    trailBreadcrumb([{ name: BLOG_NAME, path: BLOG_PATH }], siteUrl, 'خانه'),
    { '@context': 'https://schema.org', '@type': 'Blog', name: `${BLOG_NAME} ${shop}`, url },
  ]
}

/**
 * A category's JSON-LD: the backend's CollectionPage and BreadcrumbList as they come (pages on
 * `STOREFRONT_URL`, pictures on `PUBLIC_FILES_ORIGIN`, M-12; no empty logo and «وبلاگ», J-37 and
 * J-5).
 */
export function blogCategoryJsonLd(category: BlogCategoryDetail): object[] {
  return [...category.structured_data, category.breadcrumb_structured_data]
}
