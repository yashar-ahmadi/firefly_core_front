import type { FacetGroups } from '@/features/catalog/listing-filters'
import type { SortOption, SortValue } from '@/lib/api/types/catalog'
import { formatNumber } from '@/lib/format'
import { FilterSheet } from './filter-sheet'
import { SortSelect } from './sort-select'

export interface ListingToolbarProps {
  count: number
  sortOptions: SortOption[]
  defaultSort: SortValue
  groups: FacetGroups
}

/**
 * Above the results: the product count «۱۲۳ کالا», the sort and, below lg (where the sidebar is
 * hidden), the «فیلترها» button. Phones show the two controls side by side and the count under
 * them; from lg the count is at the start and the sort at the end.
 */
export function ListingToolbar({ count, sortOptions, defaultSort, groups }: ListingToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="order-last w-full text-sm text-ink-600 lg:order-none lg:w-auto lg:flex-1 lg:text-base lg:text-ink-700">
        {`${formatNumber(count)} کالا`}
      </p>
      <div className="min-w-0 flex-1 lg:hidden">
        <FilterSheet groups={groups} count={count} />
      </div>
      <div className="min-w-0 flex-1 lg:flex-none">
        <SortSelect options={sortOptions} defaultSort={defaultSort} />
      </div>
    </div>
  )
}
