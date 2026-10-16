import type { ReactNode } from 'react'
import { getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'
import { MobileBottomNav } from './mobile-bottom-nav'
import { ScrollWatcher } from './scroll-state'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

/**
 * The shop chrome around a page: skip link, announcement and header, the page in `<main>`, the
 * footer and the phone's bottom navigation, which reserves its own height at the very end of the
 * page. Used by `(shop)/layout.tsx` and by the root not-found page (unknown URLs), which Next.js
 * renders outside the shop layout.
 */
export async function ShopShell({ children }: { children: ReactNode }) {
  const t = createTranslator(await getTranslations())
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-60 focus:rounded-control focus:bg-white focus:px-4 focus:py-3 focus:font-medium focus:text-brand-800 focus:shadow-raised"
      >
        {t('skip_to_content')}
      </a>
      <ScrollWatcher />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  )
}
