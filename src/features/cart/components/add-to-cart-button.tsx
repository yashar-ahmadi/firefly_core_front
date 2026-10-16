'use client'

import { ShoppingCart } from 'lucide-react'
import { Button, type ButtonSize } from '@/components/ui/button'
import { useT } from '@/lib/i18n/i18n-context'
import { useAddToCart } from '../hooks'

const OUT_OF_STOCK = 'ناموجود'

export interface AddToCartButtonProps {
  /** The variant to add (always a variant id); null means nothing can be bought. */
  variantId: number | null
  /** Start at the variant's `order_limit_min || 1`. */
  quantity: number
  /** For the «added» toast. */
  product: { name: string; image: string }
  disabled?: boolean
  /** `md` is 44px high; `sm` is drawn at 40px with a 44px hit area. */
  size?: ButtonSize
  fullWidth?: boolean
  /** Defaults to «افزودن به سبد خرید»; a narrow card passes a shorter one. */
  label?: string
  /** `secondary` is the quieter look for a grid of cards. */
  variant?: 'primary' | 'secondary'
  /** Id of the element naming the product (a card's name link), for `aria-describedby`. */
  describedBy?: string
  /** Called once the cart has the product (not after a refusal). */
  onAdded?: () => void
  className?: string
}

/**
 * Adds a variant to the cart. While the request runs it shows a spinner, is `aria-busy` and
 * ignores further presses; a refusal shows the API's reason and the button is ready again.
 * Without a variant it is disabled and reads «ناموجود». Inside a product card it sits in the
 * card's `addSlot`, which already lifts it above the card's stretched link.
 */
export function AddToCartButton({
  variantId,
  quantity,
  product,
  disabled = false,
  size = 'md',
  fullWidth = false,
  label,
  variant = 'primary',
  describedBy,
  onAdded,
  className,
}: AddToCartButtonProps) {
  const t = useT()
  const { add, isPending } = useAddToCart()
  const unavailable = variantId === null

  return (
    <Button
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      loading={isPending}
      disabled={disabled || unavailable}
      iconStart={unavailable ? undefined : <ShoppingCart />}
      aria-describedby={describedBy}
      onClick={async () => {
        if (variantId === null) return
        if (await add(variantId, quantity, product)) onAdded?.()
      }}
      className={className}
    >
      {unavailable ? OUT_OF_STOCK : (label ?? t('add_to_cart'))}
    </Button>
  )
}
