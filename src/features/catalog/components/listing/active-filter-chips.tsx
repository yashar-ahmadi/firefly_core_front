'use client'

import { useEffect, useRef } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import {
  activeFilterCount,
  activeFilters,
  type FacetGroups,
} from '@/features/catalog/listing-filters'
import { useListingUrl } from './use-listing-url'

/** The id of the results heading, where focus goes when the last chip is removed. */
export const LISTING_RESULTS_ID = 'listing-results'

/**
 * The active filters as removable chips (44px targets) with «حذف همه»: one scrollable row on
 * phones (the sheet button shows how many there are), wrapped from md. Removing a chip moves
 * focus to the chip that took its place, else to the results heading.
 */
export function ActiveFilterChips({ groups }: { groups: FacetGroups }) {
  const { query, set, clear } = useListingUrl()
  const chips = activeFilters(query, groups)
  const listRef = useRef<HTMLUListElement>(null)
  const focusIndex = useRef<number | null>(null)

  useEffect(() => {
    const index = focusIndex.current
    if (index === null) return
    focusIndex.current = null
    const remaining = listRef.current?.querySelectorAll<HTMLElement>('[data-chip]') ?? []
    const target = remaining[Math.min(index, remaining.length - 1)]
    ;(target ?? document.getElementById(LISTING_RESULTS_ID))?.focus()
  }, [chips.length])

  if (chips.length === 0) return null
  return (
    <ul
      ref={listRef}
      aria-label="فیلترهای فعال"
      // The padding keeps the hit areas and focus rings inside the scroller.
      className="-mx-1 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto p-1 md:mx-0 md:flex-wrap md:overflow-visible md:p-0"
    >
      {chips.map((chip, index) => (
        <li key={chip.key} className="shrink-0 md:min-w-0 md:shrink">
          <Chip
            data-chip
            removable
            aria-label={`حذف فیلتر ${chip.label}`}
            onClick={() => {
              focusIndex.current = index
              set(chip.patch)
            }}
            className="max-w-72 md:max-w-full"
          >
            <span dir="auto" className="truncate">
              {chip.label}
            </span>
          </Chip>
        </li>
      ))}
      <li className="shrink-0">
        <Button variant="link" size="sm" onClick={clear} className="mx-2">
          حذف همه
        </Button>
      </li>
    </ul>
  )
}

export interface ClearFiltersButtonProps extends Pick<
  ButtonProps,
  'variant' | 'size' | 'className' | 'iconStart'
> {
  label?: string
  /** Render nothing while no filter is active. */
  onlyWhenActive?: boolean
}

/** Removes every filter (the sort stays): the empty state's way out, the sidebar's «حذف همه». */
export function ClearFiltersButton({
  label = 'حذف فیلترها',
  onlyWhenActive = false,
  variant = 'outline',
  ...props
}: ClearFiltersButtonProps) {
  const { query, clear } = useListingUrl()
  if (onlyWhenActive && activeFilterCount(query) === 0) return null
  return (
    <Button variant={variant} onClick={clear} {...props}>
      {label}
    </Button>
  )
}
