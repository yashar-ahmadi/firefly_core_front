// Shared by the listing's Server Component and its client leaves: a plain module, so the server
// reads the real string (a constant exported from a 'use client' file is a client reference).

/** The id of the results heading (an sr-only h2 with tabIndex -1). */
export const LISTING_RESULTS_ID = 'listing-results'

/**
 * Moves focus to the results heading: where focus goes when the control that had it disappears
 * (the last chip, «حذف همه», the empty state's «حذف فیلترها», a load-more that found the end).
 * The page does not scroll: the visitor stays where they were reading.
 */
export function focusListingResults(): void {
  document.getElementById(LISTING_RESULTS_ID)?.focus({ preventScroll: true })
}
