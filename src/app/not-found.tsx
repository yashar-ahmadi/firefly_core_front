import type { Metadata } from 'next'
import { storeName } from '@/app/_shell/metadata'
import { NotFoundView } from '@/components/layout/not-found-view'
import { ShopShell } from '@/components/layout/shop-shell'
import { getStoreConfig } from '@/config/store-config'
import { getSiteSettings, getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

export async function generateMetadata(): Promise<Metadata> {
  const [settings, translations] = await Promise.all([getSiteSettings(), getTranslations()])
  const t = createTranslator(translations)
  // The root layout's title template does not reach the root segment: compose it here.
  return {
    title: { absolute: `${t('not_found_meta_title')} | ${storeName(getStoreConfig(), settings)}` },
  }
}

/**
 * Unknown URLs (and `notFound()` outside the shop group). Next.js renders this inside the root
 * layout only, never inside `(shop)/layout.tsx`, so it brings the shop shell (header, footer,
 * bottom navigation) itself. The response status is 404; Next adds `noindex`.
 */
export default function NotFound() {
  return (
    <ShopShell>
      <NotFoundView />
    </ShopShell>
  )
}
