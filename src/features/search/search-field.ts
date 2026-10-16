import { HIT_AREA_SQUARE } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'

// The look of the search field, shared by the header's plain form, the suggest box and the
// phone overlay, so swapping one for another never moves anything.

export type SearchFieldSize = 'md' | 'lg'

/** `lg` is 48px (desktop and tablet), `md` 44px (phones). */
export function searchInputClasses(size: SearchFieldSize): string {
  return cn(
    'w-full rounded-control border border-transparent bg-ink-100 ps-12 pe-4 text-base text-ink-900 placeholder:text-ink-500',
    'transition-[background-color,border-color,box-shadow] duration-150 hover:bg-ink-200/70',
    'focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 focus:outline-none',
    '[&::-webkit-search-cancel-button]:appearance-none',
    size === 'lg' ? 'h-12' : 'h-11',
  )
}

/** The magnifier submit button at the field's start. */
export const SEARCH_SUBMIT = cn(
  'absolute start-1 grid size-10 cursor-pointer place-items-center rounded-control text-ink-500 transition-colors hover:text-brand-700',
  HIT_AREA_SQUARE,
)
