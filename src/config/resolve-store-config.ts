import type { FirebaseWebConfig, ServerEnv } from '@/config/env-schema'
import { PRESETS, type PresetName, type RadiusScale } from '@/config/presets'

// Pure store-config resolution. The server-only memoized accessor lives in ./store-config.

export interface ThemeConfig {
  primary: string
  accent: string
  radius: RadiusScale
  shadow: 'soft' | 'crisp'
  font: 'vazirmatn' | 'custom'
  motion: 'calm' | 'lively'
  cardStyle: 'flat' | 'elevated'
}

export interface StoreConfig {
  preset: PresetName
  /** Persian shop-type label. */
  presetLabel: string
  siteUrl: string
  /** Server-side only: never send to the browser. */
  apiUrl: string
  theme: ThemeConfig
  features: {
    compare: boolean
    quickView: boolean
    recentlyViewed: boolean
    pwa: boolean
    webPush: boolean
  }
  map: { provider: 'neshan' | 'osm'; neshanKey: string | null }
  firebase: FirebaseWebConfig | null
}

/** What the browser may see: no API URL, only the origin that serves media files. */
export type PublicStoreConfig = Omit<StoreConfig, 'apiUrl'> & { mediaOrigin: string }

/** Combines the chosen preset with the env overrides. */
export function resolveStoreConfig(env: ServerEnv): StoreConfig {
  const preset = PRESETS[env.STORE_PRESET]
  return {
    preset: preset.name,
    presetLabel: preset.label,
    siteUrl: env.SITE_URL,
    apiUrl: env.FIREFLY_API_URL,
    theme: {
      primary: env.THEME_PRIMARY ?? preset.primary,
      accent: env.THEME_ACCENT ?? preset.accent,
      radius: env.THEME_RADIUS ?? preset.radius,
      shadow: preset.shadow,
      font: env.THEME_FONT,
      motion: preset.motion,
      cardStyle: preset.cardStyle,
    },
    features: {
      compare: env.FEATURE_COMPARE,
      quickView: env.FEATURE_QUICK_VIEW,
      recentlyViewed: env.FEATURE_RECENTLY_VIEWED,
      pwa: env.FEATURE_PWA,
      webPush: env.FIREBASE !== undefined,
    },
    map: {
      provider: env.NESHAN_MAP_KEY ? 'neshan' : 'osm',
      neshanKey: env.NESHAN_MAP_KEY ?? null,
    },
    firebase: env.FIREBASE ?? null,
  }
}

/** Strips the API URL and adds the API origin, which the browser needs for media images. */
export function toPublicConfig(config: StoreConfig): PublicStoreConfig {
  const { apiUrl, ...rest } = config
  return { ...rest, mediaOrigin: new URL(apiUrl).origin }
}
