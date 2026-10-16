'use client'

import { Heart } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import {
  cardActionClasses,
  cardChipClasses,
  type CardActionSize,
} from '@/features/catalog/components/card-styles'
import { useToggleWishlist, useWishlistIds } from './hooks'

const LABEL_SAVE = 'افزودن به علاقه\u{200C}مندی\u{200C}ها'
const LABEL_REMOVE = 'حذف از علاقه\u{200C}مندی\u{200C}ها'

export interface HeartButtonProps {
  productId: number
  slug: string
  /** `sm` (default) is a 32px chip over a card image; `md` a 44px bordered button. */
  size?: CardActionSize
  className?: string
}

/**
 * The wishlist heart: pressed (and filled) when the product is saved. Guests are sent to the
 * login page. The heart beats on each toggle, never on the first render.
 */
export function HeartButton({ productId, slug, size = 'sm', className }: HeartButtonProps) {
  const { ids } = useWishlistIds()
  const { toggle, isPending } = useToggleWishlist()
  const saved = ids.has(productId)
  // A new key on each click remounts the icon, which replays the beat.
  const [beats, setBeats] = useState(0)

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? LABEL_REMOVE : LABEL_SAVE}
      onClick={() => {
        // One request at a time per heart; the optimistic state already shows the change.
        if (isPending) return
        setBeats((count) => count + 1)
        toggle({ id: productId, slug })
      }}
      className={cn(cardActionClasses(size), className)}
    >
      <span
        className={cn(cardChipClasses(size), saved && 'text-sale group-hover/action:text-sale')}
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
