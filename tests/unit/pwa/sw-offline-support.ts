import { buildServiceWorker } from '@/features/pwa/sw-source'
import { offlineCacheNames } from '@/features/pwa/sw-offline'
import { served, type Network } from './sw-scope'

// The shop as the offline-caching worker meets it (tests/unit/pwa/sw-offline*.test.ts): the
// server's answers for its pages, assets and images, and the anonymous copy it allows only when
// asked for one with `x-ff-offline: snapshot` and no cookie (src/lib/edge/offline-copy.ts).

export const VERSION = 'build-7'
export const SOURCE = buildServiceWorker({
  inboxPath: '/account/notifications/',
  icon: '/favicon.ico',
  version: VERSION,
  offline: true,
})
export const CACHES = offlineCacheNames(VERSION)

const HTML = 'text/html; charset=utf-8'
/** What Next sends with every page (the root layout is dynamic). */
export const NO_STORE = 'private, no-cache, no-store, max-age=0, must-revalidate'

/** The anonymous home page: no session, the assets its HTML names. */
export const HOME_COPY =
  '<html><head><link rel="stylesheet" href="/_next/static/chunks/app.css"/>' +
  '<link rel="preload" href="/_next/static/media/vazirmatn.woff2" as="font"/></head>' +
  '<body><h1>فایرفلای</h1><script src="/_next/static/chunks/main.js" async=""></script>' +
  '<script>self.__next_f.push([1,"I[1,[\\"/_next/static/chunks/lazy.js\\"]]"])</script></body></html>'
export const OFFLINE_COPY = '<html><body><h1>اتصال اینترنت برقرار نیست</h1></body></html>'

/** A page as the visitor's own navigation gets it: with the visitor in it, never to be kept. */
export const visitorPage = (path: string) => `<html><body>${path} برای سارا</body></html>`

export const anonymousCopy = (path: string) => (path === '/offline/' ? OFFLINE_COPY : HOME_COPY)

/** The server's consent to keep a page's anonymous copy (src/lib/edge/offline-copy.ts). */
export const CONSENT = { 'cache-control': 'no-cache', 'x-ff-offline': 'snapshot' }

export interface ShopOptions {
  /** Headers of the anonymous copy instead of the consent (a server that does not allow it). */
  copyHeaders?: Record<string, string>
  copyStatus?: number
  /** How far the server's clock (its `Date` header) is ahead of the device's, in ms. */
  serverClockAheadMs?: number
}

/** The shop's server: `online` false makes every request fail as without a network. */
export function shop(state = { online: true }, options: ShopOptions = {}): Network {
  return (request) => {
    if (!state.online) throw new TypeError('Failed to fetch')
    const { pathname } = new URL(request.url)
    if (request.headers.get('x-ff-offline') === 'snapshot') {
      const consent = request.credentials === 'omit' && !request.headers.has('cookie')
      return served(anonymousCopy(pathname), {
        status: options.copyStatus ?? 200,
        headers: {
          'content-type': HTML,
          date: new Date(Date.now() + (options.serverClockAheadMs ?? 0)).toUTCString(),
          ...(consent ? (options.copyHeaders ?? CONSENT) : { 'cache-control': NO_STORE }),
        },
      })
    }
    if (pathname.startsWith('/_next/static/')) {
      return served(`/* ${pathname} */`, {
        headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      })
    }
    if (pathname.startsWith('/_next/image') || pathname.startsWith('/media/')) {
      return served(`image ${request.url}`, { headers: { 'content-type': 'image/webp' } })
    }
    return served(visitorPage(pathname), {
      headers: { 'content-type': HTML, 'cache-control': NO_STORE },
    })
  }
}
