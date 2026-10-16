import { storeName } from '@/app/_shell/metadata'
import { getStoreConfig } from '@/config/store-config'
import { getSiteSettings } from '@/features/settings/api'

/**
 * The shop's name for `og:site_name` and not-found titles: the settings' name, else the preset's
 * label. Server-only (reads the settings, cached per request and in the Data Cache).
 */
export async function shopName(): Promise<string> {
  return storeName(getStoreConfig(), await getSiteSettings())
}
