'use client'

import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { activeFilterCount, type FacetGroups } from '@/features/catalog/listing-filters'
import { formatNumber, toPersianDigits } from '@/lib/format'
import { FilterPanel } from './filter-panel'
import { useListingPending, useListingUrl } from './use-listing-url'

export interface FilterSheetProps {
  groups: FacetGroups
  /** The listing's product count, from the latest server render. */
  count: number
}

/**
 * Below lg: the «فیلترها» button (with the number of active filters) and the filter sheet (a
 * bottom sheet on phones, a side drawer on tablets; the kit moves focus in and back). Choices
 * apply at once, like in the sidebar, so the grid behind updates and the footer's «نمایش X کالا»
 * gives the live count and closes the sheet.
 */
export function FilterSheet({ groups, count }: FilterSheetProps) {
  const [open, setOpen] = useState(false)
  const { query, clear } = useListingUrl()
  const pending = useListingPending()
  const active = activeFilterCount(query)

  const footer = (
    <>
      <Button variant="outline" onClick={clear} disabled={active === 0}>
        حذف همه
      </Button>
      <Button
        className="flex-1"
        onClick={() => setOpen(false)}
        iconStart={pending ? <Spinner size="md" /> : undefined}
      >
        {count > 0 ? `نمایش ${formatNumber(count)} کالا` : 'بستن'}
      </Button>
    </>
  )

  return (
    <>
      <Button
        variant="outline"
        fullWidth
        onClick={() => setOpen(true)}
        iconStart={<SlidersHorizontal aria-hidden />}
        className="h-12"
      >
        فیلترها
        {active > 0 && (
          <>
            <span
              aria-hidden
              className="grid h-6 min-w-6 place-items-center rounded-pill bg-brand px-1.5 text-sm leading-none font-bold text-brand-fg"
            >
              {toPersianDigits(active)}
            </span>
            <span className="sr-only">{`، ${toPersianDigits(active)} فیلتر فعال`}</span>
          </>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="فیلترها" footer={footer}>
        <FilterPanel groups={groups} />
      </Sheet>
    </>
  )
}
