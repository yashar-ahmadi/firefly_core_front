import type { ReactNode } from 'react'
import { CONTAINER } from '@/components/layout/container'
import { ShopShell } from '@/components/layout/shop-shell'
import { cn } from '@/components/ui/cn'

// Development-only previews of ProductListing (src/features/catalog/components/listing) inside
// the shop chrome, so the sticky sidebar sits under the real header: `/dev/listing/` (no route
// context, like `/product/list/`) and `/dev/listing/<category slug>/` (a category context).

export const PREVIEW_TITLE = 'mb-4 text-xl leading-9 font-bold text-ink-900 md:text-2xl'

export function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <ShopShell>
      <div className={cn(CONTAINER, 'pt-4 pb-10 md:pt-6 md:pb-14')}>{children}</div>
    </ShopShell>
  )
}
