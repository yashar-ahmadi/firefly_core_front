'use client'

import type { ReactNode } from 'react'
import { useMediaQuery } from '@/components/ui/use-media-query'
import type { FacetGroups } from '@/features/catalog/listing-filters'
import { FilterPanel } from './filter-panel'

/** The sidebar's viewport (Tailwind `lg`): below it the «فیلترها» sheet holds the filters. */
const SIDEBAR_QUERY = '(min-width: 64rem)'

/**
 * The desktop sidebar's filters, rendered from lg only. Every facet's options and the price
 * range are a few hundred elements: server-rendered, a phone downloaded them and hydrated them
 * behind `hidden` though its sheet shows its own copy (Plan 5 Task 8: the listing's blocking
 * time). Until the viewport is known (the server, hydration) and below lg, `fallback` stands in:
 * the panel's static outline (FilterPanelSkeleton, from the Server Component that renders the
 * listing, so no code for it ships), as tall as the panel, so nothing below the aside moves when
 * a desktop renders the panel right after hydration.
 */
export function SidebarFilters({
  groups,
  fallback,
}: {
  groups: FacetGroups
  fallback?: ReactNode
}) {
  const wide = useMediaQuery(SIDEBAR_QUERY)
  return wide ? <FilterPanel groups={groups} /> : fallback
}
