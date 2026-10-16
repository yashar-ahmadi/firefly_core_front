'use client'

import { GitCompareArrows } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import {
  overlayButtonClasses,
  overlayChipClasses,
  type OverlayButtonSize,
} from '@/components/ui/overlay-button-styles'
import { notify } from '@/components/ui/toaster'
import { toPersianDigits } from '@/lib/format'
import { usePersistHydration } from '@/lib/store/persisted'
import type { CompareItem } from './compare-item'
import { COMPARE_MAX, useCompare } from './store'

const LABEL_ADD = 'افزودن به مقایسه'
const LABEL_REMOVE = 'حذف از مقایسه'
const LIST_FULL = `حداکثر ${toPersianDigits(COMPARE_MAX)} کالا را می\u{200C}توان با هم مقایسه کرد. یکی را از فهرست مقایسه بردارید.`

export interface CompareToggleProps {
  item: CompareItem
  size?: OverlayButtonSize
  /** Id of the element naming the product (the card's name link), for `aria-describedby`. */
  describedBy?: string
  className?: string
}

/**
 * Adds the product to the compare list or takes it out (`aria-pressed`). Invisible until the
 * saved list has been read, so it never shows "not compared" for a compared product.
 */
export function CompareToggle({ item, size = 'sm', describedBy, className }: CompareToggleProps) {
  const hydrated = usePersistHydration(useCompare)
  const selected = useCompare((state) => state.items.some((listed) => listed.slug === item.slug))
  const add = useCompare((state) => state.add)
  const remove = useCompare((state) => state.remove)

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? LABEL_REMOVE : LABEL_ADD}
      aria-describedby={describedBy}
      onClick={() => {
        if (selected) remove(item.slug)
        else if (add(item) === 'full') notify.info(LIST_FULL)
      }}
      className={cn(overlayButtonClasses(size), !hydrated && 'invisible', className)}
    >
      <span
        className={cn(
          overlayChipClasses(size),
          selected &&
            'bg-brand text-brand-fg group-hover/action:bg-brand-700 group-hover/action:text-brand-fg',
        )}
      >
        <GitCompareArrows aria-hidden />
      </span>
    </button>
  )
}
