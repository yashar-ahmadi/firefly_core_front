import { getServerEnv } from '@/config/env'
import { getSiteSettings } from '@/features/settings/api'
import {
  defaultFavicon,
  FAVICON_REVALIDATE_SECONDS,
  loadFavicon,
} from '@/features/settings/favicon'

/**
 * `/favicon.ico`, which browsers request by themselves (a page whose icon fails to load, a direct
 * visit): the shop's favicon from its settings, else a bundled neutral icon, never a 404. The
 * bundled one is kept by browsers only briefly, so a favicon that comes back shows soon.
 */
export const dynamic = 'force-dynamic'

const FALLBACK_MAX_AGE_SECONDS = 300

export async function GET(): Promise<Response> {
  const settings = await getSiteSettings()
  const configured = await loadFavicon(settings?.favicon, getServerEnv().FIREFLY_API_URL)
  const icon = configured ?? defaultFavicon()
  const maxAge = configured ? FAVICON_REVALIDATE_SECONDS : FALLBACK_MAX_AGE_SECONDS
  return new Response(icon.bytes, {
    headers: {
      'Content-Type': icon.type,
      'Cache-Control': `public, max-age=${maxAge}`,
      // Bytes from the API host: never sniffed into anything but the image type they claim.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
