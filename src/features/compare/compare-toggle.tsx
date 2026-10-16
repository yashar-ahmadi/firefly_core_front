'use client'

import { GitCompareArrows } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import {
  overlayButtonClasses,
  overlayChipClasses,
  type OverlayButtonSize,
} from '@/components/ui/overlay-button-styles'
import { notify } from '@/components/ui/toaster'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { toPersianDigits } from '@/lib/format'
import { usePersistHydration } from '@/lib/store/persisted'
import { isOtherCategory, type CompareItem } from './compare-item'
import { COMPARE_MAX, useCompare } from './store'

const LABEL_ADD = 'افزودن به مقایسه'
const LABEL_REMOVE = 'حذف از مقایسه'
const LIST_FULL = `حداکثر ${toPersianDigits(COMPARE_MAX)} کالا را می\u{200C}توانید مقایسه کنید`
const OTHER_CATEGORY = 'این کالا با کالاهای فهرست مقایسه هم\u{200C}دسته نیست'

export interface CompareToggleProps {
  item: CompareItem
  size?: OverlayButtonSize
  /** Id of the element naming the product (the card's name link), for `aria-describedby`. */
  describedBy?: string
  className?: string
}

/**
 * Adds the product to the compare list or takes it out (`aria-pressed`). Invisible until the
 * saved list has been read, so it never shows "not compared" for a compared product. A full
 * list says so; a product of another category than the list's first is added with a note
 * (spec §8.12: compatible categories are expected, not enforced). Not shown while the shop has
 * comparison switched off.
 */
export function CompareToggle({ item, size = 'sm', describedBy, className }: CompareToggleProps) {
  const hydrated = usePersistHydration(useCompare)
  const selected = useCompare((state) => state.items.some((listed) => listed.slug === item.slug))
  const add = useCompare((state) => state.add)
  const remove = useCompare((state) => state.remove)
  // The shop's switch: off, there is no compare page to fill a list for.
  const enabled = useOptionalStoreConfig()?.features.compare !== false
  if (!enabled) return null

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? LABEL_REMOVE : LABEL_ADD}
      aria-describedby={describedBy}
      onClick={() => {
        if (selected) {
          remove(item.slug)
          return
        }
        const result = add(item)
        if (result === 'full') notify.info(LIST_FULL)
        else if (result === 'added' && isOtherCategory(useCompare.getState().items[0], item)) {
          notify.info(OTHER_CATEGORY)
        }
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
