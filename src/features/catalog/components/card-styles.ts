import { cn } from '@/components/ui/cn'

// Class recipes shared by ProductCard and its skeleton. The buttons over the image use
// `overlayButtonClasses` from the UI kit.

/**
 * The card surface; the skeleton uses the same box so a grid never shifts when cards arrive.
 * Its padding is mirrored by `CARD_IMAGE_OVERLAY`: change both together.
 */
export const CARD_SURFACE =
  'relative flex h-full flex-col gap-3 rounded-card bg-white p-2.5 shadow-card sm:p-3'

/**
 * A box exactly over the card image (the first thing inside `CARD_SURFACE`'s padding). The
 * labels and buttons shown on the image live in such boxes placed after the name in the DOM, so
 * the name is read and focused first. Clicks pass through to the card link except on buttons.
 */
export const CARD_IMAGE_OVERLAY =
  'pointer-events-none absolute inset-x-2.5 top-2.5 z-[1] aspect-square sm:inset-x-3 sm:top-3'

/** The text column under the image. */
export const CARD_BODY = 'flex flex-1 flex-col gap-1.5 px-0.5'

/** Two lines of 28px: the name box keeps this height even for a one-line name. */
export const CARD_NAME_BOX = 'min-h-14'

/**
 * The price box always fits a struck price over the final price (a `sm` Price with a discount is
 * 50px tall), so discounted and plain cards, and the skeleton, are the same height.
 */
export const CARD_PRICE_BOX = 'mt-auto flex min-h-[3.125rem] flex-col justify-end'

/**
 * On devices that hover, card buttons appear on hover and while anything in the card has focus
 * (so they stay reachable by keyboard); a pressed one stays visible. Touch screens always show
 * them. Tailwind's `group-hover` already applies only where hover exists.
 */
export const REVEAL_ON_HOVER = cn(
  '[@media(hover:hover)]:opacity-0',
  'group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100',
)
