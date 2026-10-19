import { storeName } from '@/app/_shell/metadata'
import { getServerEnv } from '@/config/env'
import { getStoreConfig } from '@/config/store-config'
import { appIcon, parseIconSize } from '@/features/pwa/app-icon'
import { getSiteSettings } from '@/features/settings/api'

/**
 * `/icons/192/` and `/icons/512/`: the installed app's icons (the manifest's), PNGs made from the
 * settings' favicon or logo, or a monogram in the brand colour (src/features/pwa/app-icon.ts).
 * Any other size is a 404. Kept by browsers a day (an hour for the monogram, so a logo set later
 * shows soon). The proxy leaves `/icons/` alone.
 */
export const dynamic = 'force-dynamic'

const SOURCE_MAX_AGE_SECONDS = 86_400
const MONOGRAM_MAX_AGE_SECONDS = 3_600

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
): Promise<Response> {
  const size = parseIconSize((await params).size)
  if (size === null) return new Response(null, { status: 404 })
  const config = getStoreConfig()
  const settings = await getSiteSettings()
  const icon = await appIcon({
    size,
    name: storeName(config, settings),
    favicon: settings?.favicon,
    logo: settings?.logo,
    primary: config.theme.primary,
    apiUrl: getServerEnv().FIREFLY_API_URL,
  })
  const maxAge = icon.fromSource ? SOURCE_MAX_AGE_SECONDS : MONOGRAM_MAX_AGE_SECONDS
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${maxAge}`,
      // Made here from the API host's bytes: never sniffed into anything else.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
