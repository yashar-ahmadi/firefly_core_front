import { cn } from '@/components/ui/cn'

// Class recipes shared by ProductCard, its skeleton and the buttons laid over the card image.

/**
 * The card surface; the skeleton uses the same box so a grid never shifts when cards arrive.
 * Its padding is mirrored by `CARD_IMAGE_OVERLAY`: change both together.
 */
export const CARD_SURFACE =
  'relative flex h-full flex-col gap-3 rounded-card bg-white p-2.5 shadow-card sm:p-3'

/**
 * A box over the card image (the first thing inside `CARD_SURFACE`'s padding) for the buttons
 * placed on it; it lets clicks through to the card link except on the buttons themselves.
 */
export const CARD_IMAGE_OVERLAY =
  'pointer-events-none absolute inset-x-2.5 top-2.5 z-[1] aspect-square sm:inset-x-3 sm:top-3'

/** The text column under the image. */
export const CARD_BODY = 'flex flex-1 flex-col gap-1.5 px-0.5'

/** Two lines of 28px: the name box keeps this height even for a one-line name. */
export const CARD_NAME_BOX = 'min-h-14'

/** The price box fits a struck price over the final price, so rows line up across a grid. */
export const CARD_PRICE_BOX = 'mt-auto flex min-h-12 flex-col justify-end'

export type CardActionSize = 'sm' | 'md'

/**
 * A round icon button over an image: always a 44px touch target. `sm` draws a 32px chip inside
 * it (cards); `md` fills it (the product page).
 */
export function cardActionClasses(size: CardActionSize = 'sm'): string {
  return cn(
    'group/action relative grid size-11 shrink-0 place-items-center rounded-full',
    'transition-opacity duration-150 select-none',
    size === 'md' && 'border border-ink-200 bg-white shadow-sm',
  )
}

/** The visible chip inside `cardActionClasses`. */
export function cardChipClasses(size: CardActionSize = 'sm'): string {
  return cn(
    'grid place-items-center rounded-full text-ink-700 transition-[color,background-color,transform] duration-150',
    'group-hover/action:text-ink-900 motion-safe:group-active/action:scale-90',
    size === 'sm'
      ? 'size-8 bg-white/90 shadow-sm ring-1 ring-ink-900/5 group-hover/action:bg-white [&_svg]:size-[18px]'
      : 'size-full [&_svg]:size-5',
  )
}

/**
 * On devices that hover, card buttons appear on hover and while anything in the card has focus
 * (so they stay reachable by keyboard); a pressed one stays visible. Touch screens always show
 * them. Tailwind's `group-hover` already applies only where hover exists.
 */
export const REVEAL_ON_HOVER = cn(
  '[@media(hover:hover)]:opacity-0',
  'group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100',
)
