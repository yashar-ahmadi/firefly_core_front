import type { ReactNode } from 'react'
import { MobileBottomNav } from './mobile-bottom-nav'
import { ScrollWatcher } from './scroll-state'
import { ShellFrame } from './shell-frame'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

/**
 * The shop chrome around a page (`ShellFrame`): announcement and header, the page in
 * `<main id="main">`, the footer and the phone's bottom navigation, which reserves its own height
 * at the very end of the page. Used by `(shop)/layout.tsx` and by the root not-found page
 * (unknown URLs), which Next.js renders outside the shop layout. `overlays` (the shop layout's
 * compare bar and quick view host) come last, after the navigation and the shop's polite live
 * region (`announce`).
 */
export function ShopShell({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  return (
    <ShellFrame
      header={
        <>
          <ScrollWatcher />
          <SiteHeader />
        </>
      }
      footer={
        <>
          <SiteFooter />
          <MobileBottomNav />
        </>
      }
      overlays={overlays}
    >
      {children}
    </ShellFrame>
  )
}
