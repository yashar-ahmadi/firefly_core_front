'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { productPath } from '@/features/catalog/listing-routes'
import { loadPage } from '@/lib/navigation/hard-navigation'
import type { QuickViewProps } from './quick-view'
import { closeQuickView, registerQuickViewHost, useQuickViewStore } from './use-quick-view'

/** While the panel's code downloads (a first press with no hover before, say): a busy pill. */
function QuickViewPending() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/2 z-50 flex justify-center">
      <span className="rounded-pill bg-white p-3 text-brand-600 shadow-raised">
        <Spinner size="lg" label="در حال بارگذاری مشاهده سریع" />
      </span>
    </div>
  )
}

/**
 * Stands in for the panel when its code could not be downloaded (a stale chunk after a deploy, a
 * dropped connection): the product page, as a full load with fresh code, is the way on.
 */
function QuickViewUnavailable({ request }: QuickViewProps) {
  useEffect(() => {
    loadPage(productPath(request.slug))
  }, [request.slug])
  return null
}

// The panel and everything it shows (gallery, picker, buy controls) load on the first opening,
// or earlier when a trigger is hovered or focused (preloadQuickView): listing pages do not
// carry that code. A failed download resolves to QuickViewUnavailable: next/dynamic's `loading`
// never sees the error, and React.lazy would throw it (and keep throwing it) to the page's
// error boundary, replacing the whole shop.
const QuickView = dynamic(
  () => import('./quick-view').then((module) => module.QuickView).catch(() => QuickViewUnavailable),
  { ssr: false, loading: QuickViewPending },
)

/**
 * The one quick view of the shop pages, mounted by the shop layout. Renders nothing until a
 * product is asked for (`useQuickView().open`). Each opening mounts a fresh panel; a closed one
 * stays mounted until the next, so it can animate out and give the focus back. A navigation
 * (the details link, Back) closes it: the layout, and so the host, outlives the page.
 */
export function QuickViewHost() {
  const request = useQuickViewStore((state) => state.request)
  const open = useQuickViewStore((state) => state.open)
  const pathname = usePathname()
  const shownOn = useRef(pathname)

  useEffect(() => registerQuickViewHost(), [])
  useEffect(() => {
    if (shownOn.current === pathname) return
    shownOn.current = pathname
    closeQuickView()
  }, [pathname])

  if (!request) return null
  return (
    <QuickView
      key={request.id}
      request={request}
      open={open}
      onOpenChange={(next) => {
        if (!next) closeQuickView()
      }}
    />
  )
}
