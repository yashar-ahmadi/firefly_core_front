import type { ReactNode } from 'react'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { ScrollWatcher } from '@/components/layout/scroll-state'
import { SiteHeader } from '@/components/layout/site-header'
import { getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

/**
 * The shop shell: skip link, announcement and header, the page, the footer (Task 13) and the
 * phone's bottom navigation, which reserves its own height at the very end of the page.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
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
      {/* Task 13: <SiteFooter /> goes here. */}
      <MobileBottomNav />
    </div>
  )
}
