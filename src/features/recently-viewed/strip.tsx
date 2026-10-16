'use client'

import { useId } from 'react'
import { ProductRail } from '@/features/catalog/components/product-rail'
import { SectionHeader } from '@/features/home/sections/section-header'
import { useT } from '@/lib/i18n/i18n-context'
import { usePersistHydration } from '@/lib/store/persisted'
import { useRecentlyViewed } from './store'

/**
 * «بازدیدهای اخیر»: the products this device viewed last, newest first, as a rail of the same
 * cards. It reads localStorage, so it renders nothing on the server, during hydration and when
 * nothing was viewed: the markup never mismatches and no empty box is shown.
 */
export function RecentlyViewedStrip({ showOutOfStockLabel }: { showOutOfStockLabel: boolean }) {
  const t = useT()
  const id = useId()
  const hydrated = usePersistHydration(useRecentlyViewed)
  const items = useRecentlyViewed((state) => state.items)
  if (!hydrated || items.length === 0) return null
  const title = t('recently_viewed')
  return (
    <div className="min-w-0">
      <SectionHeader id={id} title={title} />
      <ProductRail products={items} ariaLabel={title} showOutOfStockLabel={showOutOfStockLabel} />
    </div>
  )
}
