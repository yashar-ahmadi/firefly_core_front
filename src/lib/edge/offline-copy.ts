import type { NextRequest } from 'next/server'
import { OFFLINE_COPY, OFFLINE_COPY_HEADER, OFFLINE_PAGES } from '@/features/pwa/offline-rules'
import { prefetchKind } from '@/lib/http/prefetch'

// The server's consent to the service worker's offline copies (Plan 5 Task 6). Every page goes
// out `private, no-store` (the root layout is dynamic) and the worker keeps no such response.
// Two pages have an offline copy, the offline page and the home page (`OFFLINE_PAGES`): the
// worker asks for each itself, with `x-ff-offline: snapshot` and no cookie at all
// (`credentials: 'omit'`), so the page renders for nobody (no session, no guest cart). Only that
// request is answered `Cache-Control: no-cache` (it may be kept, and is asked for again before
// any reuse) with the header back; anything else about the request (a cookie, `Authorization`,
// another page, a router fetch) leaves Next's `private, no-store` as it is.

/**
 * The response headers that let the worker keep a page's anonymous copy. No `Vary` here: Next
 * writes every page's `Vary` itself (`res.setHeader('Vary', …)` in its app-page runtime), replacing
 * any the proxy set (seen on the 16.4.1 build). `Vary: X-FF-Offline`, so a shared cache reuses the
 * copy only for the worker's own request, is the edge's: deploy/nginx.conf.example adds it to
 * every response carrying `x-ff-offline: snapshot` back.
 */
export const OFFLINE_COPY_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-cache',
  [OFFLINE_COPY_HEADER]: OFFLINE_COPY,
}

const OFFLINE_COPY_PAGES: readonly string[] = OFFLINE_PAGES

/** Whether `request` is the worker's own request for an offline page's anonymous copy. */
export function isOfflineCopyRequest(request: NextRequest): boolean {
  const { headers } = request
  return (
    request.method === 'GET' &&
    headers.get(OFFLINE_COPY_HEADER) === OFFLINE_COPY &&
    !headers.has('cookie') &&
    !headers.has('authorization') &&
    // A document, as the worker asks for it: no router fetch, no prefetch.
    !headers.has('rsc') &&
    prefetchKind(headers) === null &&
    OFFLINE_COPY_PAGES.includes(request.nextUrl.pathname)
  )
}
