import { cn } from '@/components/ui/cn'

// Class recipes shared by the header's second row (mega-menu and drawer triggers, header links).

/** The «دسته‌بندی‌ها» trigger: bold, with a brand underline while its menu is open. */
export const CATEGORIES_TRIGGER = cn(
  'relative flex h-12 shrink-0 cursor-pointer items-center gap-2 px-3 text-base font-bold text-ink-800',
  'transition-colors hover:text-brand-700 focus-visible:-outline-offset-2',
  'aria-expanded:text-brand-700 data-[state=open]:text-brand-700',
  'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:scale-x-0 after:rounded-full after:bg-brand',
  'motion-safe:after:transition-transform aria-expanded:after:scale-x-100',
)

/** A link of `menu/header`; the current page is brand-coloured. */
export const HEADER_LINK = cn(
  'relative flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-control px-3 text-base text-ink-700',
  'transition-colors hover:text-brand-700 focus-visible:-outline-offset-2',
  'aria-[current=page]:font-medium aria-[current=page]:text-brand-700 data-[state=open]:text-brand-700',
)
