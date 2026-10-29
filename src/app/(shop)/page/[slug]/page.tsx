import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getStoreConfig } from '@/config/store-config'
import { getFirstComments } from '@/features/comments/first-comments'
import { oneSegment } from '@/features/catalog/loaders/read'
import { getPage, SIGN_IN } from '@/features/content/pages/api'
import { ContentPage } from '@/features/content/pages/content-page'
import { commentsShown, contentPagePath } from '@/features/content/pages/page-routes'
import { contentPageJsonLd, contentPageMetadata } from '@/features/content/pages/page-seo'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'
import { loginHref } from '@/lib/links/login'

interface ContentPageRouteProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: ContentPageRouteProps): Promise<Metadata> {
  const { slug } = await params
  const [page, shop] = await Promise.all([getPage(slug), shopName()])
  if (page === null) return notFoundMetadata()
  // The page sends the visitor to login: nothing of it is known, nothing to index.
  if (page === SIGN_IN) return { robots: { index: false, follow: false } }
  return contentPageMetadata(page, shop, getStoreConfig().siteUrl)
}

/**
 * `/page/<slug>/` (content digest §3–§4), in the shop's layout: an operator's content page in its
 * layout, with its meta rows, breadcrumb JSON-LD and comments (ContentPage). Indexable, except a
 * staff preview of a draft (noindex, read uncached with the staff token: `getPage`).
 *
 * A page for signed-in visitors only (`requires_login`, content digest §2) is read with the
 * visitor's session, uncached, and is noindex; a visitor without one (or whose session the API
 * refuses) is sent to login, back here after (`/login/?next=/page/<slug>/`).
 *
 * Status codes (R9): no loading.tsx; the page is awaited and `notFound()` called (missing, a draft
 * for a guest, `list`) or the redirect made before anything streams. Only the comments' first
 * page streams, in its own in-page `<Suspense>`. A page counts no views, so its links may be
 * prefetched.
 */
export default async function ContentPageRoute({ params }: ContentPageRouteProps) {
  const { slug } = await params
  const page = await getPage(slug)
  if (page === null) notFound()
  if (page === SIGN_IN) redirect(loginHref(contentPagePath(oneSegment(slug)?.text ?? slug)))
  // Start page 1 of the comments now (React cache() shares it with SeededComments); a page for
  // signed-in visitors only reads its comments in the browser, with the session.
  if (commentsShown(page) && page.comment_count > 0 && !page.requires_login) {
    void getFirstComments('page', page.slug, 'comment')
  }
  return <ContentPage page={page} jsonLd={contentPageJsonLd(page, getStoreConfig().siteUrl)} />
}
