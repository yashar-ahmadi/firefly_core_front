import { cn } from '@/components/ui/cn'

// The phone's fixed bottom bars: the shop's bottom navigation, or a page's own bar in its place
// (the product page's buy bar). Both are one 4rem row above the home indicator, so the room kept
// for them at the end of the page is the same.

/** The fixed frame below md: the safe-area inset is padding under the row. */
export const BOTTOM_BAR_FRAME = cn(
  'fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)]',
  'shadow-[0_-4px_16px_-8px_rgb(15_23_42/0.12)] md:hidden',
)

/** The bar's one row. */
export const BOTTOM_BAR_ROW = 'h-16'

/** At the very end of the page (after the footer): nothing ends up under the bar. */
export const BOTTOM_BAR_SPACER = 'h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden'
