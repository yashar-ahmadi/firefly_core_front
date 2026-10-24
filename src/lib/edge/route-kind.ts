import { carriesCredential, type RouteKind } from '@/config/credential-routes'
import { OFFLINE_PATH } from '@/features/pwa/offline-rules'

/**
 * The kind the proxy marks a page with (`x-ff-route-kind`, src/config/credential-routes.ts):
 * `credential` when its URL holds a payment credential or leads back to one; `offline` for the
 * offline page, which the service worker keeps and shows in place of a page whose navigation
 * failed, at that page's URL (a payment link's too); else `page`. Operator code renders on `page`
 * alone.
 */
export function routeKind(url: { pathname: string; searchParams: URLSearchParams }): RouteKind {
  if (carriesCredential(url)) return 'credential'
  return url.pathname === OFFLINE_PATH ? 'offline' : 'page'
}
