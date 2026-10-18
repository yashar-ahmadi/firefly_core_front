'use client'

import { CircleCheck, MessageSquarePlus } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import type { PaymentCatalog } from '@/features/payment/catalog'
import type { OrderDetail, OrderLine } from '@/lib/api/types/order-detail'
import { formatNumber } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import { OrderLines } from '../components/order-lines'
import { OrderProgress } from '../components/order-progress'
import { OrderTimeline } from '../components/order-timeline'
import { progressFromServer } from '../progress'
import { OrderActions } from './order-actions'
import { OrderDelivery, OrderReceiver } from './order-delivery'
import { OrderFacts } from './order-header'
import { OrderMoney } from './order-money'
import { OrderPayments } from './order-payments'

// An account order's page body (order digest §6.4): its facts and actions; then, in the main
// column, the server's progress (drawn exactly) with the milestones' moments, the lines (a review
// per `review_state`: «ثبت دیدگاه» to that purchase on the reviews page, «دیدگاه شما ثبت شده», or
// nothing), the payments and the factual timeline; beside it the money, the delivery and the
// receiver. Every section a region named by its heading.

const CARD = 'flex flex-col gap-4 rounded-card bg-white p-4 shadow-card md:p-5'
const HEADING = 'text-lg leading-8 font-bold text-ink-900'

function Section({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={CARD}>
      <h2 id={id} className={HEADING}>
        {title}
      </h2>
      {children}
    </section>
  )
}

const MILESTONES: [keyof OrderDetail['milestones'], string][] = [
  ['confirmed_at', 'تأیید سفارش'],
  ['packed_at', 'بسته‌بندی'],
  ['dispatched_at', 'ارسال'],
  ['delivered_at', 'تحویل'],
  ['cancelled_at', 'لغو'],
  ['returned_at', 'مرجوع'],
]

function Milestones({ order }: { order: OrderDetail }) {
  const reached = MILESTONES.filter(([field]) => order.milestones[field])
  if (reached.length === 0) return null
  return (
    <dl className="grid gap-x-6 gap-y-1 border-t border-ink-100 pt-3 text-sm leading-6 sm:grid-cols-2">
      {reached.map(([field, label]) => (
        <div key={field} className="flex flex-wrap gap-x-2">
          <dt className="text-ink-600">{label}:</dt>
          <dd className="text-ink-800">
            <time dateTime={order.milestones[field]!}>
              {formatJalaliDateTime(order.milestones[field]!)}
            </time>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export const reviewPath = (code: string, slug: string) =>
  `/account/reviews/?order=${code}&product=${encodeURIComponent(slug)}`

function ReviewAction({ code, line }: { code: string; line: OrderLine }) {
  if (line.review_state === 'reviewed') {
    return (
      <p className="flex items-center gap-1.5 text-sm leading-6 text-success">
        <CircleCheck aria-hidden className="size-4" />
        دیدگاه شما ثبت شده
      </p>
    )
  }
  if (line.review_state !== 'awaiting' || !line.product_slug) return null
  return (
    <Link
      href={reviewPath(code, line.product_slug)}
      className={buttonClasses({ variant: 'outline', size: 'sm' })}
    >
      <MessageSquarePlus aria-hidden />
      ثبت دیدگاه <span className="sr-only">{line.product_name}</span>
    </Link>
  )
}

export interface OrderViewProps {
  order: OrderDetail
  catalog: PaymentCatalog
  supportPhone: string | null
}

export function OrderView({ order, catalog, supportPhone }: OrderViewProps) {
  const code = order.order_code
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <section aria-label={'خلاصه\u{0654} سفارش'} className={CARD}>
        <OrderFacts order={order} />
        <OrderActions order={order} catalog={catalog} supportPhone={supportPhone} />
      </section>
      <div className="grid items-start gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Section id="order-progress-heading" title="وضعیت سفارش">
            <OrderProgress progress={progressFromServer(order.progress)} />
            <Milestones order={order} />
          </Section>
          <Section
            id="order-lines-heading"
            title={`اقلام سفارش (${formatNumber(order.item_count)} کالا)`}
          >
            <OrderLines
              lines={order.lines}
              action={(line) => <ReviewAction code={code} line={line} />}
            />
          </Section>
          <Section id="order-payments-heading" title="پرداخت‌ها">
            <OrderPayments code={code} />
          </Section>
          <div className={CARD}>
            <OrderTimeline timeline={order.timeline} />
          </div>
        </div>
        <div className="flex flex-col gap-4 md:gap-5">
          <Section id="order-money-heading" title="مبلغ سفارش">
            <OrderMoney order={order} />
          </Section>
          <Section id="order-delivery-heading" title="ارسال">
            <OrderDelivery order={order} />
          </Section>
          <Section id="order-receiver-heading" title="گیرنده">
            <OrderReceiver order={order} />
          </Section>
        </div>
      </div>
    </div>
  )
}
