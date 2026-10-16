import type { Metadata } from 'next'
import { NotFoundView } from '@/components/layout/not-found-view'
import { ShopShell } from '@/components/layout/shop-shell'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

export function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
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
