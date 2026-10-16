'use client'

import { Heart } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import {
  overlayButtonClasses,
  overlayChipClasses,
  type OverlayButtonSize,
} from '@/components/ui/overlay-button-styles'
import { useHydrated } from '@/components/ui/use-media-query'
import { useToggleWishlist, useWishlistIds } from './hooks'

const LABEL_SAVE = 'افزودن به علاقه\u{200C}مندی\u{200C}ها'
const LABEL_REMOVE = 'حذف از علاقه\u{200C}مندی\u{200C}ها'

export interface HeartButtonProps {
  productId: number
  slug: string
  /** `sm` (default) is a 32px chip over a card image; `md` a 44px bordered button. */
  size?: OverlayButtonSize
  /** Id of the element naming the product (the card's name link), for `aria-describedby`. */
  describedBy?: string
  className?: string
}

/**
 * The wishlist heart: pressed (and filled) when the product is saved. Guests are sent to the
 * login page. The heart beats on each toggle, never on the first render.
 *
 * The server and hydration render it unpressed whatever the session or cache hold (a section
 * streamed in after the ids arrived would otherwise mismatch); the saved state shows from the
 * first client render. While a signed-in visitor's ids are still loading it is `aria-disabled`
 * and ignores clicks, since a click could not know whether to save or remove.
 */
export function HeartButton({
  productId,
  slug,
  size = 'sm',
  describedBy,
  className,
}: HeartButtonProps) {
  const hydrated = useHydrated()
  const { ids, isLoading } = useWishlistIds()
  const { toggle, isPending } = useToggleWishlist()
  const saved = hydrated && ids.has(productId)
  const waiting = hydrated && isLoading
  // A new key on each click remounts the icon, which replays the beat.
  const [beats, setBeats] = useState(0)

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? LABEL_REMOVE : LABEL_SAVE}
      aria-describedby={describedBy}
      aria-disabled={waiting || undefined}
      onClick={() => {
        // One request at a time per heart; the optimistic state already shows the change.
        if (waiting || isPending) return
        setBeats((count) => count + 1)
        toggle({ id: productId, slug })
      }}
      className={cn(overlayButtonClasses(size), className)}
    >
      <span
        className={cn(overlayChipClasses(size), saved && 'text-sale group-hover/action:text-sale')}
      >
        <Heart
          key={beats}
          aria-hidden
          className={cn(saved && 'fill-current', beats > 0 && 'motion-safe:animate-heart')}
        />
      </span>
    </button>
  )
}
