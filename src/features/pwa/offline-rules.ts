// What the service worker (`/sw.js`, sw-offline.ts) may keep for offline use, in one place: the
// worker embeds these lists, the proxy (src/lib/edge/offline-copy.ts) and the install prompt read
// them too. Pure; safe in any bundle.

/**
 * Paths the worker never caches and never answers from a cache (Plan 5 Global Constraints, Plan 4
 * routes, ruling of Task 6). A trailing `/` covers the path itself and everything under it;
 * without one, the exact path. A navigation there goes to the network alone; when the network
 * fails it gets the offline page, never a copy of the page. (Pages are kept from an allow-list,
 * `OFFLINE_PAGES`, so a spelling of one of these paths that slips past this list is still never
 * answered from a cache.)
 */
export const SW_NEVER_CACHED = [
  // The BFF (`/api/bff/*`) and the API routes the shop serves itself (`/api/v1/*`: the bank's
  // return leg).
  '/api/',
  // The visitor's own pages: the account, the cart, the checkout (its thanks page too), the
  // payment pages and the order's links (track, pay: a payment link's token is a credential).
  '/account/',
  '/cart/',
  '/checkout/',
  '/payment/',
  '/order/',
  // Every auth route.
  '/login/',
  '/register/',
  '/forgot-password/',
  // Short links count each visit.
  '/s/',
  // Always fresh: the worker itself, the manifest, the health check.
  '/sw.js',
  '/manifest.webmanifest',
  '/healthz/',
] as const

/**
 * The only pages kept for offline use, each as an anonymous copy (no cookie, no session: see
 * `OFFLINE_COPY_HEADER`): the offline page (kept first) and the home page (the installed app's
 * start page). A navigation to any other page is the network's, or the offline page.
 */
export const OFFLINE_PAGES = ['/offline/', '/'] as const

/** The page shown for a navigation the network cannot answer. */
export const OFFLINE_PATH = '/offline/'

/**
 * The worker asks for a page's offline copy with this request header (and no cookie at all,
 * `credentials: 'omit'`); the proxy answers such a request for an `OFFLINE_PAGES` page with
 * `Cache-Control: no-cache` and the same header back, the server's consent to keep that copy.
 * Every other page response stays `private, no-store`, and the worker keeps no such response.
 */
export const OFFLINE_COPY_HEADER = 'x-ff-offline'
export const OFFLINE_COPY = 'snapshot'
