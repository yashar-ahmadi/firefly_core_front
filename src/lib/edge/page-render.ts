import { NextResponse, type NextRequest } from 'next/server'
import { ROUTE_KIND_HEADER, type RouteKind } from '@/config/credential-routes'
import { BLOG_OFF_HEADER, blogOffHeaderValue, type BlogOff } from '@/lib/edge/blog-gate'

// How the proxy (src/proxy.ts) lets a page render: the request headers the page sees, marked
// by the proxy alone, and the response's status.

/** What the proxy decided about a page it lets render. */
export interface PageMark {
  kind: RouteKind
  /** A blog page while the blog is switched off: rendered, with 503 (`blog-switch.ts`). */
  blogOff: BlogOff | null
}

/** "Temporarily": the API's own advice on `feature_disabled` (it is only advice). */
const BLOG_RETRY_AFTER_SECONDS = '300'

/**
 * A path the proxy leaves alone is never marked; a visitor's own marker is dropped on the way,
 * so what renders there (an asset-like URL's 404 page) is unmarked and gets no operator code.
 */
export function leftAlone(request: NextRequest): NextResponse {
  if (!request.headers.has(ROUTE_KIND_HEADER)) return NextResponse.next()
  const headers = new Headers(request.headers)
  headers.delete(ROUTE_KIND_HEADER)
  return NextResponse.next({ request: { headers } })
}

/**
 * The request headers the page renders with: the visitor's, with the proxy's own route kind and
 * blog verdict (a visitor's `x-ff-blog-off` never reaches a page).
 */
export function pageHeaders(request: NextRequest, mark: PageMark): Headers {
  const headers = new Headers(request.headers)
  headers.set(ROUTE_KIND_HEADER, mark.kind)
  headers.delete(BLOG_OFF_HEADER)
  if (mark.blogOff) headers.set(BLOG_OFF_HEADER, blogOffHeaderValue(mark.blogOff))
  return headers
}

/**
 * The page renders with `headers` (by default `pageHeaders`). While the blog is off a blog page
 * answers 503 with `Retry-After`: Next keeps the proxy's status for the render it lets through
 * (checked on the build, documents and RSC requests alike; a router fetch that gets the 503
 * loads the page as a document, which shows the same).
 */
export function renderPage(
  request: NextRequest,
  mark: PageMark,
  headers: Headers = pageHeaders(request, mark),
): NextResponse {
  const unavailable = mark.blogOff
    ? { status: 503, headers: { 'Retry-After': BLOG_RETRY_AFTER_SECONDS } }
    : {}
  return NextResponse.next({ ...unavailable, request: { headers } })
}
