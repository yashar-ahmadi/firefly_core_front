'use client'

import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { notify } from '@/components/ui/toaster'

/** One «added» toast at a time: a new add replaces the last one instead of stacking. */
const TOAST_ID = 'cart-added'
const ADDED = 'کالا به سبد خرید اضافه شد.'
const VIEW_CART = 'مشاهده\u{0654} سبد خرید'

export interface AddedToCartToastProps {
  name: string
  image: string
  /** The API's success message; a default sentence when empty. */
  message?: string
  /** Called when the cart link is followed (closes the toast). */
  onNavigate?: () => void
}

/** The body of the «added to cart» toast: the product's image and name and a link to the cart. */
export function AddedToCartToast({ name, image, message, onNavigate }: AddedToCartToastProps) {
  return (
    <div className="flex items-center gap-3 font-normal">
      <SmartImage
        src={image}
        alt=""
        ratio="1/1"
        sizes="48px"
        className="w-12 shrink-0 rounded-control bg-ink-50"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{message || ADDED}</p>
        <p dir="auto" className="truncate text-sm text-ink-700">
          {name}
        </p>
        <Link
          href="/cart/"
          prefetch={false}
          onClick={onNavigate}
          className={cn(buttonClasses({ variant: 'link', size: 'sm' }), 'mt-0.5')}
        >
          {VIEW_CART}
        </Link>
      </div>
    </div>
  )
}

/** Shows the «added to cart» toast for a product. */
export function showAddedToCartToast(props: Omit<AddedToCartToastProps, 'onNavigate'>): void {
  notify.success(<AddedToCartToast {...props} onNavigate={() => notify.dismiss(TOAST_ID)} />, {
    id: TOAST_ID,
  })
}
