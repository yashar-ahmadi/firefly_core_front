'use client'

import { useMediaQuery } from '@/components/ui/use-media-query'
import type { FacetGroups } from '@/features/catalog/listing-filters'
import { FilterPanel } from './filter-panel'

/** The sidebar's viewport (Tailwind `lg`): below it the «فیلترها» sheet holds the filters. */
const SIDEBAR_QUERY = '(min-width: 64rem)'

/**
 * The desktop sidebar's filters, rendered from lg only. Every facet's options and the price
 * range are a few hundred elements: server-rendered, a phone downloaded them and hydrated them
 * behind `hidden` though its sheet shows its own copy (Plan 5 Task 8: the listing's blocking
 * time). The server and hydration render none (no viewport yet); a desktop renders the panel
 * right after hydration, in its own column, so nothing else on the page moves.
 */
export function SidebarFilters({ groups }: { groups: FacetGroups }) {
  const wide = useMediaQuery(SIDEBAR_QUERY)
  return wide ? <FilterPanel groups={groups} /> : null
}
