'use client'

import { MessageSquarePlus } from 'lucide-react'
import Link from 'next/link'
import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { productPath } from '@/features/catalog/listing-routes'
import type { AwaitingReviewOrder, AwaitingReviewProduct } from '@/lib/api/types/order-review'
import { formatJalaliDate, toPersianDigits } from '@/lib/format'

// One purchase awaiting a review (order digest §3.1.6): an article named by the product (a link
// to its page), its picture, the order it came with and when it was delivered, and «ثبت دیدگاه»
// («ثبت دیدگاه جدید» when the shopper reviewed this product before, with another order). The
// purchase the order's page sent the shopper to is marked and its button takes the focus.

export const reviewCardId = (code: string, productId: number) => `review-${code}-${productId}`

export interface AwaitingReviewCardProps {
  order: AwaitingReviewOrder
  product: AwaitingReviewProduct
  /** The purchase the URL named. */
  target: boolean
  buttonRef?: Ref<HTMLButtonElement>
  onReview: () => void
}

export function AwaitingReviewCard({
  order,
  product,
  target,
  buttonRef,
  onReview,
}: AwaitingReviewCardProps) {
  const id = reviewCardId(order.order_code, product.id)
  return (
    <article
      id={id}
      aria-labelledby={`${id}-name`}
      className={cn(
        'flex flex-col gap-3 rounded-card bg-white p-4 shadow-card sm:flex-row sm:items-center md:p-5',
        target && 'ring-2 ring-brand',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <SmartImage
          src={product.image}
          alt=""
          ratio="1/1"
          sizes="64px"
          className="size-16 shrink-0 overflow-hidden rounded-control bg-ink-50"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${id}-name`} className="text-base leading-7 font-bold text-ink-900">
            <Link
              href={productPath(product.slug)}
              dir="auto"
              className="hover:text-brand-700 hover:underline"
            >
              {product.name}
            </Link>
          </h2>
          {/* Two facts side by side, no separator glyph: a middle dot beside digits reads as «۰». */}
          <p className="flex flex-wrap gap-x-4 text-sm leading-6 text-ink-600">
            <span>
              سفارش{' '}
              <bdi dir="ltr" className="tabular-nums">
                {toPersianDigits(order.order_code)}
              </bdi>
            </span>
            {order.delivered_at ? (
              <span>
                {'تحویل: '}
                <time dateTime={order.delivered_at}>{formatJalaliDate(order.delivered_at)}</time>
              </span>
            ) : (
              <span>تاریخ تحویل ثبت نشده</span>
            )}
          </p>
        </div>
      </div>
      <Button
        ref={buttonRef}
        variant={target ? 'primary' : 'outline'}
        aria-haspopup="dialog"
        iconStart={<MessageSquarePlus aria-hidden />}
        onClick={onReview}
        className="sm:shrink-0"
      >
        {product.has_other_review ? 'ثبت دیدگاه جدید' : 'ثبت دیدگاه'}
        <span className="sr-only"> {product.name}</span>
      </Button>
    </article>
  )
}
