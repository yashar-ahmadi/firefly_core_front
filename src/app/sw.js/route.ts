import { NOTIFICATIONS_PATH } from '@/features/notifications/notifications-api'
import { buildServiceWorker } from '@/features/pwa/sw-source'

/**
 * `/sw.js`: the site's single service worker, for the whole site (scope `/`). Web push registers
 * it when the visitor turns notifications on (src/features/push); Plan 5 adds offline caching to
 * the same worker. Browsers check it for updates on every navigation, so it is never cached
 * without asking (`no-cache`). The proxy leaves it alone (an asset path).
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  const source = buildServiceWorker({ inboxPath: NOTIFICATIONS_PATH, icon: '/favicon.ico' })
  return new Response(source, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache',
    },
  })
}
