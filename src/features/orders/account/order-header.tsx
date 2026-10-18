import { BadgeCheck, CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { formatJalaliDate } from '@/lib/format'
import { statusTone } from '../status-tone'

// The top of an account order's page (order digest §6.4): when it was placed and paid, where it
// was sold when not on the website, and two facts as badges: confirmed (the shop is preparing
// it) and fully paid (online and at the door). The heading, its code and status are the page's
// own (AccountPageHeader); the actions go under these facts.

const CHANNELS: Record<string, string> = {
  social_media: 'شبکه‌های اجتماعی',
  store: 'فروشگاه حضوری',
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-ink-600">{term}:</dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
  )
}

export function OrderStatusBadge({ order }: { order: OrderDetail }) {
  return (
    <Badge data-status="" tone={statusTone(order.status)}>
      {order.status_display}
    </Badge>
  )
}

export function OrderFacts({ order }: { order: OrderDetail }) {
  const channel = CHANNELS[order.channel]
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-x-6 gap-y-1 text-base leading-7 sm:grid-cols-2">
        <Fact term="تاریخ ثبت">
          <time dateTime={order.placed_at}>{formatJalaliDate(order.placed_at)}</time>
        </Fact>
        {order.paid_at && (
          <Fact term="تاریخ پرداخت">
            <time dateTime={order.paid_at}>{formatJalaliDate(order.paid_at)}</time>
          </Fact>
        )}
        {channel && <Fact term="محل خرید">{channel}</Fact>}
      </dl>
      {(order.is_confirmed || order.is_fully_paid) && (
        <div className="flex flex-wrap gap-2">
          {order.is_confirmed && (
            <Badge tone="success">
              <CircleCheck aria-hidden />
              تأیید شده
            </Badge>
          )}
          {order.is_fully_paid && (
            <Badge tone="success">
              <BadgeCheck aria-hidden />
              پرداخت کامل
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
