import { Apple, Download, Globe, Play, ShoppingBag, Store, type LucideIcon } from 'lucide-react'
import type { SiteSettings } from '@/lib/api/types/settings'
import { httpUrl } from '@/lib/html/safe-url'
import type { Translate } from '@/lib/i18n/translator'
import { FOOTER_HEADING } from './footer-styles'

type AppLinkSettings = Pick<
  SiteSettings,
  | 'google_play_download_link'
  | 'android_application_download_link'
  | 'app_store_download_link'
  | 'ios_application_download_link'
  | 'web_application_link'
>

export interface AppBadge {
  key: string
  href: string
  /** The small first line: «دریافت از», «دانلود مستقیم» or «استفاده از». */
  hint: string
  /** The store or platform: «گوگل‌پلی», «بازار», «اندروید»… */
  name: string
  icon: LucideIcon
}

/** Iranian stores recognised by host in the "direct" links (Android, then iOS). */
const STORES: Array<{ host: string; key: string; icon: LucideIcon }> = [
  { host: 'cafebazaar.ir', key: 'app_bazaar', icon: ShoppingBag },
  { host: 'myket.ir', key: 'app_myket', icon: Store },
  { host: 'sibapp.com', key: 'app_sibapp', icon: Apple },
  { host: 'sibche.com', key: 'app_sibche', icon: Apple },
  { host: 'anardoni.com', key: 'app_anardoni', icon: Apple },
]

function storeFor(href: string) {
  const host = new URL(href).hostname.toLowerCase()
  return STORES.find((store) => host === store.host || host.endsWith(`.${store.host}`))
}

/**
 * The download badges for the links that are set, Android first (most Iranian visitors):
 * Google Play, the Android link, the App Store, the iOS link, then the web app. The Android and
 * iOS links are named after their store when it is recognised (Bazaar, Myket, Sibapp, Sibche,
 * Anardoni) and are a direct download otherwise. A null or non-http link has no badge.
 */
export function appBadges(settings: AppLinkSettings, t: Translate): AppBadge[] {
  const getFrom = t('app_get_from')
  const store = (name: string, icon: LucideIcon) => () => ({ hint: getFrom, name, icon })
  const direct = (platform: string) => (href: string) => {
    const known = storeFor(href)
    return known
      ? { hint: getFrom, name: t(known.key), icon: known.icon }
      : { hint: t('app_direct_download'), name: platform, icon: Download }
  }
  const links: Array<[string, string | null, (href: string) => Omit<AppBadge, 'key' | 'href'>]> = [
    ['google', settings.google_play_download_link, store(t('app_google_play'), Play)],
    ['android', settings.android_application_download_link, direct(t('app_android'))],
    ['app-store', settings.app_store_download_link, store(t('app_app_store'), Apple)],
    ['ios', settings.ios_application_download_link, direct(t('app_ios'))],
    [
      'web',
      settings.web_application_link,
      () => ({ hint: t('app_use'), name: t('app_web'), icon: Globe }),
    ],
  ]
  return links.flatMap(([key, link, describe]) => {
    const href = httpUrl(link)
    return href ? [{ key, href, ...describe(href) }] : []
  })
}

/** «دریافت اپلیکیشن» (`appBadges()`): dark, store-like buttons (icon, hint, name) opening in a new tab. */
export function AppBadges({ badges, title }: { badges: readonly AppBadge[]; title: string }) {
  if (badges.length === 0) return null
  return (
    <section aria-labelledby="footer-apps">
      <h2 id="footer-apps" className={FOOTER_HEADING}>
        {title}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {badges.map(({ key, href, hint, name, icon: Icon }) => (
          <li key={key}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-14 min-w-36 items-center gap-3 rounded-control bg-ink-900 ps-3 pe-5 text-white transition-colors hover:bg-ink-700"
            >
              <Icon aria-hidden className="size-6 shrink-0" />
              <span className="flex flex-col leading-tight">
                <span className="text-sm text-ink-300">{hint}</span>{' '}
                <bdi className="text-base font-bold">{name}</bdi>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
