import type { ReactNode } from 'react'
import { MobileBottomNav } from './mobile-bottom-nav'
import { ScrollWatcher } from './scroll-state'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

/**
 * The shop chrome around a page: announcement and header, the page in `<main id="main">` (the
 * target of the root layout's skip link), the footer and the phone's bottom navigation, which
 * reserves its own height at the very end of the page. Used by `(shop)/layout.tsx` and by the root
 * not-found page (unknown URLs), which Next.js renders outside the shop layout. `overlays` (the
 * shop layout's compare bar and quick view host) come last, after the navigation.
 */
export function ShopShell({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollWatcher />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
      <MobileBottomNav />
      {overlays}
    </div>
  )
}
