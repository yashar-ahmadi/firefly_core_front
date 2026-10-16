'use client'

import { ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Price } from '@/components/ui/price'
import { Sheet } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import type { Cart } from '@/lib/api/types/cart'
import { formatNumber, formatToman } from '@/lib/format'
import { useT } from '@/lib/i18n/i18n-context'
import { cartCount, useCart } from '../hooks'
import { MiniCartLine } from './mini-cart-line'

const VIEW_CART = 'مشاهده\u{0654} سبد خرید'
const SUMMARY_NOTE = 'هزینه\u{0654} ارسال و مالیات در مرحله\u{0654} بعد محاسبه می\u{200C}شود.'

/**
 * The goods total exactly as the API computed it (`goods_payable`: after product and coupon
 * discounts), the savings when there are any, and the two ways on. `total` is not shown: before
 * a shipping method is chosen it holds the tax but not the shipping, so it is neither the goods
 * sum nor the final amount; the checkout summary shows the full breakdown.
 */
function MiniCartSummary({ cart, onNavigate }: { cart: Cart; onNavigate: () => void }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink-800">جمع سبد خرید</span>
        <Price amount={cart.goods_payable} size="md" />
      </div>
      {cart.total_savings > 0 && (
        <div className="mt-1 flex items-center justify-between gap-3 text-sale">
          <span className="text-sm font-medium">سود شما از این خرید</span>
          <span className="text-sm font-bold">{formatToman(cart.total_savings)}</span>
        </div>
      )}
      <p className="mt-1 text-sm text-ink-600">{SUMMARY_NOTE}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button asChild fullWidth>
          <Link href="/checkout/" prefetch={false} onClick={onNavigate}>
            ثبت سفارش
          </Link>
        </Button>
        <Button asChild variant="outline" fullWidth>
          <Link href="/cart/" prefetch={false} onClick={onNavigate}>
            {VIEW_CART}
          </Link>
        </Button>
      </div>
    </div>
  )
}

function MiniCartBody({ onNavigate }: { onNavigate: () => void }) {
  const t = useT()
  const { data: cart, isError, refetch } = useCart()

  if (!cart) {
    return isError ? (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-ink-700">دریافت سبد خرید ممکن نشد.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {t('retry')}
        </Button>
      </div>
    ) : (
      <div className="grid place-items-center py-16 text-brand-600">
        <Spinner size="lg" label={t('loading')} />
      </div>
    )
  }

  if (cart.is_empty) {
    return (
      <EmptyState
        icon={<ShoppingCart />}
        title="سبد خرید شما خالی است"
        description="کالاهای دلخواهتان را پیدا کنید و به سبد خرید بیفزایید."
        headingLevel={3}
        action={
          <Button asChild variant="outline">
            <Link href="/" onClick={onNavigate}>
              {`بازگشت به ${t('home_page')}`}
            </Link>
          </Button>
        }
      />
    )
  }

  return (
    <ul className="divide-y divide-ink-100">
      {cart.lines.map((line) => (
        <MiniCartLine key={line.variant_id} line={line} onNavigate={onNavigate} />
      ))}
    </ul>
  )
}

export interface MiniCartProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The cart in a sheet (a side drawer from md, which is where the header opens it): the lines,
 * the payable total from the API and links to checkout and the cart page; an empty cart offers
 * the home page. Opening it reads the cart again, since prices and stock are live. Following any
 * of its links closes it (the header stays mounted across client navigations).
 */
export function MiniCart({ open, onOpenChange }: MiniCartProps) {
  const t = useT()
  const { data: cart, refetch } = useCart()
  const close = () => onOpenChange(false)
  const filled = cart !== undefined && !cart.is_empty

  useEffect(() => {
    // Joins a read already on its way rather than restarting it.
    if (open) void refetch({ cancelRefetch: false })
  }, [open, refetch])

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('cart')}
      description={filled ? `${formatNumber(cartCount(cart))} کالا` : undefined}
      footer={filled ? <MiniCartSummary cart={cart} onNavigate={close} /> : undefined}
    >
      <MiniCartBody onNavigate={close} />
    </Sheet>
  )
}
