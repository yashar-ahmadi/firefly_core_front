import { getStoreConfig } from '@/config/store-config'
import { NOTIFICATIONS_PATH } from '@/features/notifications/notifications-api'
import { buildVersion } from '@/features/pwa/build-version'
import { buildServiceWorker } from '@/features/pwa/sw-source'

/**
 * `/sw.js`: the site's single service worker, for the whole site (scope `/`). The root layout
 * registers it when FEATURE_PWA is on (src/features/pwa/register-sw.tsx), and web push when the
 * visitor turns notifications on (src/features/push); it is the same registration. With
 * FEATURE_PWA off it shows pushes only (no offline caching, read at request time: R5). Browsers
 * check it for updates on every navigation, so it is never cached without asking (`no-cache`).
 * The proxy leaves it alone (an asset path).
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  const source = buildServiceWorker({
    inboxPath: NOTIFICATIONS_PATH,
    icon: '/favicon.ico',
    version: buildVersion(),
    offline: getStoreConfig().features.pwa,
  })
  return new Response(source, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache',
    },
  })
}
