import type { ReactNode } from 'react'
import { ShopShell } from '@/components/layout/shop-shell'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { getStoreConfig } from '@/config/store-config'
import { CompareBar } from '@/features/compare/compare-bar'
import { LazyPushReregister } from '@/features/push/lazy-push-reregister'
import { QuickViewHost } from '@/features/quick-view/quick-view-host'

/**
 * The shop pages: header, footer and bottom navigation around every page (see ShopShell), plus
 * the shop-wide extras the store has switched on: the floating compare bar, the one quick view
 * host every card, rail and table opens, and web push's re-register effect (renders nothing).
 * Each sits in its own WidgetBoundary: a render bug in one takes only that widget off the page,
 * never the page with it.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  const { features } = getStoreConfig()
  return (
    <ShopShell
      overlays={
        <>
          {features.compare && (
            <WidgetBoundary name="compare-bar">
              <CompareBar />
            </WidgetBoundary>
          )}
          {features.quickView && (
            <WidgetBoundary name="quick-view">
              <QuickViewHost />
            </WidgetBoundary>
          )}
          {features.webPush && (
            <WidgetBoundary name="push">
              <LazyPushReregister />
            </WidgetBoundary>
          )}
        </>
      }
    >
      {children}
    </ShopShell>
  )
}
