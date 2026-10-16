import { cn } from './cn'

// Round icon buttons laid over an image (product cards, a product gallery).

export type OverlayButtonSize = 'sm' | 'md'

/**
 * Always a 44px touch target. `sm` draws a 32px chip inside it (`overlayChipClasses`), so the
 * icons stay light on a small image; `md` is a full 44px bordered button.
 */
export function overlayButtonClasses(size: OverlayButtonSize = 'sm'): string {
  return cn(
    'group/action relative grid size-11 shrink-0 place-items-center rounded-full',
    'transition-opacity duration-150 select-none aria-disabled:cursor-progress',
    size === 'md' && 'border border-ink-200 bg-white shadow-sm',
  )
}

/** The visible chip inside `overlayButtonClasses`. */
export function overlayChipClasses(size: OverlayButtonSize = 'sm'): string {
  return cn(
    'grid place-items-center rounded-full text-ink-700 transition-[color,background-color,transform] duration-150',
    'group-hover/action:text-ink-900 motion-safe:group-active/action:scale-90',
    size === 'sm'
      ? 'size-8 bg-white/90 shadow-sm ring-1 ring-ink-900/5 group-hover/action:bg-white [&_svg]:size-[18px]'
      : 'size-full [&_svg]:size-5',
  )
}
