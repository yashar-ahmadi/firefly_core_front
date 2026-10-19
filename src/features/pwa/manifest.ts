import type { MetadataRoute } from 'next'
import { storeName, storeSlogan } from '@/app/_shell/metadata'
import type { StoreConfig } from '@/config/resolve-store-config'
import type { SiteSettings } from '@/lib/api/types/settings'

// The web app manifest (`/manifest.webmanifest`, src/app/manifest.ts) from the shop's settings
// and store config. Pure. It is served whatever FEATURE_PWA says: the browser's own install
// (and iOS, where web push needs the shop installed) reads it; the flag governs the offline
// worker and the shop's install prompt.

/** A launcher shows about this many characters of `short_name`. */
const SHORT_NAME_MAX = 12

/** A last word shorter than this names nothing («من»). */
const SHORT_NAME_MIN = 3

/**
 * The name for the launcher: the shop's name when short enough, else its last word (Persian
 * shop names put the brand last: «فروشگاه اینترنتی …») when it can name the shop, else the name
 * as it is (the launcher shortens it).
 */
export function shortName(name: string): string {
  if (name.length <= SHORT_NAME_MAX) return name
  const last = name.split(/\s+/).at(-1) ?? ''
  return last.length >= SHORT_NAME_MIN && last.length <= SHORT_NAME_MAX ? last : name
}

/** Where the installed app opens: the home page, marked (its canonical stays `/`). */
export const START_URL = '/?source=pwa'

const icon = (size: 192 | 512, purpose: 'any' | 'maskable') => ({
  src: `/icons/${size}/`,
  sizes: `${size}x${size}`,
  type: 'image/png',
  purpose,
})

export function buildManifest(
  config: Pick<StoreConfig, 'presetLabel' | 'theme'>,
  settings: SiteSettings | null,
): MetadataRoute.Manifest {
  const name = storeName(config, settings)
  const description = storeSlogan(settings)
  return {
    id: '/',
    name,
    short_name: shortName(name),
    ...(description ? { description } : {}),
    lang: 'fa',
    dir: 'rtl',
    start_url: START_URL,
    scope: '/',
    display: 'standalone',
    theme_color: config.theme.primary,
    background_color: '#ffffff',
    icons: [icon(192, 'any'), icon(512, 'any'), icon(512, 'maskable')],
    shortcuts: [
      { name: 'جستجو', url: '/search/' },
      { name: 'سبد خرید', url: '/cart/' },
      { name: 'سفارش‌های من', short_name: 'سفارش‌ها', url: '/account/orders/' },
    ],
  }
}
