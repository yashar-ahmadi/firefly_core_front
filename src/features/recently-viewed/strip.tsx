'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { Button } from '@/components/ui/button'
import { Carousel, type SlidesPerView } from '@/components/ui/carousel'
import { useT } from '@/lib/i18n/i18n-context'
import { usePersistHydration } from '@/lib/store/persisted'
import { RecentCard } from './recent-card'
import { useRecentlyViewed } from './store'

const PER_VIEW: SlidesPerView = { base: 2.5, md: 4.5, lg: 6 }
const CLEARED = 'فهرست بازدیدهای اخیر پاک شد.'

export interface RecentlyViewedStripProps {
  /** Left out of the rail: the product page's own product (recorded as viewed on arrival). */
  excludeSlug?: string
}

/**
 * «بازدیدهای اخیر»: the products this device viewed last, newest first, as a rail of compact
 * cards (picture, name, link), with «پاک کردن» to forget them. Once cleared, a note takes the
 * strip's place and the focus (the pressed button is gone). It reads localStorage, so it
 * renders nothing on the server, during hydration and when nothing was viewed: the markup never
 * mismatches and no empty box is shown.
 */
export function RecentlyViewedStrip({ excludeSlug }: RecentlyViewedStripProps) {
  const t = useT()
  const id = useId()
  const hydrated = usePersistHydration(useRecentlyViewed)
  const saved = useRecentlyViewed((state) => state.items)
  const clear = useRecentlyViewed((state) => state.clear)
  const [cleared, setCleared] = useState(false)
  const noteRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (cleared) noteRef.current?.focus()
  }, [cleared])

  if (cleared) {
    return (
      <p
        ref={noteRef}
        role="status"
        tabIndex={-1}
        className="rounded-card bg-white px-4 py-3 text-base text-ink-700 shadow-card outline-none"
      >
        {CLEARED}
      </p>
    )
  }
  const items = excludeSlug ? saved.filter((item) => item.slug !== excludeSlug) : saved
  if (!hydrated || items.length === 0) return null
  const title = t('recently_viewed')
  return (
    <div className="min-w-0">
      <SectionHeader
        id={id}
        title={title}
        action={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`پاک کردن ${title}`}
            onClick={() => {
              clear()
              setCleared(true)
            }}
            className="-me-2"
          >
            پاک کردن
          </Button>
        }
      />
      <Carousel ariaLabel={title} slidesPerView={PER_VIEW} arrowGutters>
        {items.map((item) => (
          <RecentCard key={item.slug} item={item} />
        ))}
      </Carousel>
    </div>
  )
}
