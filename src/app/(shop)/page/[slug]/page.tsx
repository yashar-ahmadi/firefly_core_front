import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStoreConfig } from '@/config/store-config'
import { getFirstComments } from '@/features/comments/first-comments'
import { getPage } from '@/features/content/pages/api'
import { ContentPage } from '@/features/content/pages/content-page'
import { commentsShown } from '@/features/content/pages/page-routes'
import { contentPageJsonLd, contentPageMetadata } from '@/features/content/pages/page-seo'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'

interface ContentPageRouteProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: ContentPageRouteProps): Promise<Metadata> {
  const { slug } = await params
  const [page, shop] = await Promise.all([getPage(slug), shopName()])
  if (page === null) return notFoundMetadata()
  return contentPageMetadata(page, shop, getStoreConfig().siteUrl)
}

/**
 * `/page/<slug>/` (content digest §3–§4), in the shop's layout: an operator's content page in its
 * layout, with its meta rows, breadcrumb JSON-LD and comments (ContentPage). Indexable, except a
 * staff preview of a draft (noindex, read uncached with the staff token: `getPage`).
 *
 * Status codes (R9): no loading.tsx; the page is awaited and `notFound()` called (missing, a draft
 * for a guest, `list`) before anything streams. Only the comments' first page streams, in its own
 * in-page `<Suspense>`. A page counts no views, so its links may be prefetched.
 */
export default async function ContentPageRoute({ params }: ContentPageRouteProps) {
  const { slug } = await params
  const page = await getPage(slug)
  if (page === null) notFound()
  // Start page 1 of the comments now (React cache() shares it with SeededComments).
  if (commentsShown(page) && page.comment_count > 0) {
    void getFirstComments('page', page.slug, 'comment')
  }
  return <ContentPage page={page} jsonLd={contentPageJsonLd(page, getStoreConfig().siteUrl)} />
}
