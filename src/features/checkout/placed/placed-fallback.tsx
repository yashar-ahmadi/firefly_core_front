'use client'

import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { toPersianDigits } from '@/lib/format'
import type { PlacedContext } from '../placed-order'
import { thanksPath } from '../thanks-path'

/**
 * The order placed, when the code of its payment could not load (a deploy since the page loaded,
 * the connection): its code and the way to its page, which shows how to pay it.
 */
export function PlacedFallback({ ctx }: { ctx: PlacedContext }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-card bg-white p-5 shadow-card md:p-6">
      <h2 className="text-xl leading-9 font-bold text-ink-900">سفارش شما ثبت شد</h2>
      <p className="text-base leading-7 text-ink-700">
        {'کد سفارش: '}
        <bdi dir="ltr" className="font-bold">
          {toPersianDigits(ctx.orderCode)}
        </bdi>
      </p>
      <Link href={thanksPath(ctx.orderCode)} className={buttonClasses()}>
        مشاهده و پرداخت سفارش
      </Link>
    </section>
  )
}
