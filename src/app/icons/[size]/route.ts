import { storeName } from '@/app/_shell/metadata'
import { getServerEnv } from '@/config/env'
import { getStoreConfig } from '@/config/store-config'
import { appIcon, parseIconSize, type AppIcon, type IconSize } from '@/features/pwa/app-icon'
import { fallbackIcon } from '@/features/pwa/fallback-icons'
import { getSiteSettings } from '@/features/settings/api'

/**
 * `/icons/192/` and `/icons/512/`: the installed app's icons (the manifest's), PNGs made from the
 * settings' favicon or logo, or a monogram in the brand colour (src/features/pwa/app-icon.ts),
 * or the bundled brand-neutral icon when sharp cannot load or fails: never a 500, so the shop
 * stays installable. Any other size is a 404. Kept by browsers a day (an hour for the monogram,
 * so a logo set later shows soon; five minutes for the bundled icon, so the shop's own shows soon
 * after the deploy is fixed). The proxy leaves `/icons/` alone.
 */
export const dynamic = 'force-dynamic'

const SOURCE_MAX_AGE_SECONDS = 86_400
const MONOGRAM_MAX_AGE_SECONDS = 3_600
const FALLBACK_MAX_AGE_SECONDS = 300

async function iconOf(size: IconSize): Promise<AppIcon> {
  try {
    const config = getStoreConfig()
    const settings = await getSiteSettings()
    return await appIcon({
      size,
      name: storeName(config, settings),
      favicon: settings?.favicon,
      logo: settings?.logo,
      primary: config.theme.primary,
      apiUrl: getServerEnv().FIREFLY_API_URL,
    })
  } catch {
    // appIcon never throws; a configuration that cannot be read still gets an icon.
    return { bytes: fallbackIcon(size), fromSource: false, fallback: true }
  }
}

function maxAgeOf(icon: AppIcon): number {
  if (icon.fallback) return FALLBACK_MAX_AGE_SECONDS
  return icon.fromSource ? SOURCE_MAX_AGE_SECONDS : MONOGRAM_MAX_AGE_SECONDS
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
): Promise<Response> {
  const size = parseIconSize((await params).size)
  if (size === null) return new Response(null, { status: 404 })
  const icon = await iconOf(size)
  const maxAge = maxAgeOf(icon)
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${maxAge}`,
      // Made here from the API host's bytes: never sniffed into anything else.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
