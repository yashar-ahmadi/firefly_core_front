import type { MetadataRoute } from 'next'
import { getStoreConfig } from '@/config/store-config'
import { buildManifest } from '@/features/pwa/manifest'
import { getSiteSettings } from '@/features/settings/api'

/**
 * `/manifest.webmanifest` (Next links it from every page's head): built at request time from the
 * settings and the store config (R5), never at build time. The service worker never keeps it
 * (offline-rules.ts), so a renamed shop shows on the next install.
 */
export const dynamic = 'force-dynamic'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return buildManifest(getStoreConfig(), await getSiteSettings())
}
