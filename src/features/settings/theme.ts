import 'server-only'
import { cache } from 'react'
import { getStoreConfig, type ThemeConfig } from '@/config/store-config'
import { withPanelColours } from '@/lib/theme/panel-colours'
import { getSiteSettings } from './api'

/**
 * The shop's theme as this request draws it: the store config's (THEME_* over the preset) with
 * the panel's colours over it (`withPanelColours`). Read from the cached settings, so a colour
 * changed in the panel shows within their five minutes (or at once on `revalidateTag('settings')`).
 */
export const getTheme = cache(async (): Promise<ThemeConfig> =>
  withPanelColours(getStoreConfig().theme, await getSiteSettings()),
)
