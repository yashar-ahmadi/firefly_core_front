import type { Metadata, Viewport } from 'next'
import type { StoreConfig, ThemeConfig } from '@/config/resolve-store-config'
import type { SiteSettings } from '@/lib/api/types/settings'

// Root metadata from the shop's settings. Pure, so the null-settings fallback is easy to test.

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** The shop's name; the preset's Persian label when the settings are missing or blank. */
export function storeName(config: Pick<StoreConfig, 'presetLabel'>, settings: SiteSettings | null) {
  return present(settings?.name) ?? config.presetLabel
}

/** The shop's slogan; null when the settings are missing or it is blank. */
export function storeSlogan(settings: SiteSettings | null): string | null {
  return present(settings?.slogan)
}

/** The home page's default title: `<store name> | <slogan>`, or the name alone. */
export function homeTitle(name: string, slogan: string | null): string {
  return slogan ? `${name} | ${slogan}` : name
}

/**
 * `<store name> | <slogan>` on the home page, `<page> | <store name>` below it. Keys without a
 * value are left out, never set to `undefined`.
 */
export function buildRootMetadata(
  config: Pick<StoreConfig, 'presetLabel' | 'siteUrl'>,
  settings: SiteSettings | null,
): Metadata {
  const name = storeName(config, settings)
  const slogan = storeSlogan(settings)
  const favicon = present(settings?.favicon)
  return {
    metadataBase: new URL(config.siteUrl),
    title: { default: homeTitle(name, slogan), template: `%s | ${name}` },
    ...(slogan ? { description: slogan } : {}),
    ...(favicon ? { icons: { icon: favicon } } : {}),
    // iOS would turn order numbers and prices into phone links.
    formatDetection: { telephone: false },
  }
}

/** The browser chrome takes the brand colour. */
export function buildRootViewport(theme: Pick<ThemeConfig, 'primary'>): Viewport {
  return { themeColor: theme.primary }
}
