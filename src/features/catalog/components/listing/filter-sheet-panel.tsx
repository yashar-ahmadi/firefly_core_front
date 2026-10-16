'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { activeFilterCount, type FacetGroups } from '@/features/catalog/listing-filters'
import { formatNumber } from '@/lib/format'
import { FilterPanel } from './filter-panel'
import { useListingPending, useListingUrl } from './use-listing-url'

export interface FilterSheetPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: FacetGroups
  /** The listing's product count, from the latest server render. */
  count: number
}

/**
 * The filter sheet of `FilterSheet` (a bottom sheet on phones, a side drawer on tablets; the kit
 * moves focus in and back). Choices apply at once, like in the sidebar, so the grid behind
 * updates and the footer's «نمایش X کالا» gives the live count and closes the sheet. «حذف همه» is
 * disabled once nothing is left to clear, so it hands focus to that button (the sheet is modal:
 * focus stays inside it). Loaded on the first opening.
 */
export function FilterSheetPanel({ open, onOpenChange, groups, count }: FilterSheetPanelProps) {
  const { query, clear } = useListingUrl()
  const pending = useListingPending()
  const active = activeFilterCount(query)
  const showRef = useRef<HTMLButtonElement>(null)

  const footer = (
    <>
      <Button
        variant="outline"
        onClick={() => {
          clear()
          showRef.current?.focus()
        }}
        disabled={active === 0}
      >
        حذف همه
      </Button>
      <Button
        ref={showRef}
        className="flex-1"
        onClick={() => onOpenChange(false)}
        iconStart={pending ? <Spinner size="md" /> : undefined}
      >
        {count > 0 ? `نمایش ${formatNumber(count)} کالا` : 'بستن'}
      </Button>
    </>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="فیلترها" footer={footer}>
      <FilterPanel groups={groups} />
    </Sheet>
  )
}
