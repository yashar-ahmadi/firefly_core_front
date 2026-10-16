'use client'

import { SlidersHorizontal } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PanelPending } from '@/components/ui/panel-pending'
import { trackPresses } from '@/components/ui/press-tracking'
import { activeFilterCount, type FacetGroups } from '@/features/catalog/listing-filters'
import { toPersianDigits } from '@/lib/format'
import { FilterPanel } from './filter-panel'
import type { FilterSheetPanelProps } from './filter-sheet-panel'
import { useListingUrl } from './use-listing-url'

type LazyProps = FilterSheetPanelProps & { onUnavailable: () => void }

/** Stands in for the sheet when its code could not be downloaded. */
function SheetUnavailable({ onUnavailable }: LazyProps) {
  useEffect(() => onUnavailable(), [onUnavailable])
  return null
}

// The sheet (Vaul and Radix Dialog) loads on the first opening, or earlier when the button is
// hovered, focused or pressed.
const FilterSheetPanel = dynamic<LazyProps>(
  () =>
    import('./filter-sheet-panel')
      .then((module) => module.FilterSheetPanel)
      .catch(() => SheetUnavailable),
  { ssr: false, loading: () => <PanelPending label="در حال بارگذاری فیلترها" /> },
)
/** A failed preload is dropped: the first opening imports the code itself. */
const preload = () => {
  import('./filter-sheet-panel').catch(() => {})
}

export interface FilterSheetProps {
  groups: FacetGroups
  /** The listing's product count, from the latest server render. */
  count: number
}

/**
 * Below lg: the «فیلترها» button (with the number of active filters), which opens the filter
 * sheet (FilterSheetPanel, loaded on the first opening). If the sheet's code cannot be
 * downloaded, the filters show in place under the button instead.
 */
export function FilterSheet({ groups, count }: FilterSheetProps) {
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)
  const [inline, setInline] = useState(false)
  const inlineId = useId()
  const { query } = useListingUrl()
  const active = activeFilterCount(query)
  // The sheet returns the focus to its opener: record presses before its code is loaded.
  useEffect(trackPresses, [])

  return (
    <>
      <Button
        variant="outline"
        fullWidth
        aria-haspopup={inline ? undefined : 'dialog'}
        aria-expanded={inline || open}
        aria-controls={inline ? inlineId : undefined}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          if (inline) return
          setRequested(true)
          setOpen(true)
        }}
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
      {requested && !inline && (
        <FilterSheetPanel
          open={open}
          onOpenChange={setOpen}
          groups={groups}
          count={count}
          onUnavailable={() => setInline(true)}
        />
      )}
      {inline && (
        <section id={inlineId} aria-label="فیلترها" className="mt-3 w-full">
          <FilterPanel groups={groups} />
        </section>
      )}
    </>
  )
}
