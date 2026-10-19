'use client'

import { ClipboardX } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { Skeleton } from '@/components/ui/skeleton'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { AccountPageHeader } from '@/features/account/layout/account-page-header'
import { ListError } from '@/features/account/lists/list-error'
import { isLoadingSection } from '@/features/account/use-account-query'
import type { PaymentCatalog } from '@/features/payment/catalog'
import { isApiNotFound } from '@/lib/api/errors'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { toPersianDigits } from '@/lib/format'
import { CopyCode } from './copy-code'
import { OrderStatusBadge } from './order-header'
import { useOrder } from './orders-api'
import { OrderView } from './order-view'

// `/account/orders/<code>/` (order digest §3.1.3, §6.4), the island: the server's own read of the
// order for the first render (the page answered 404 already when there is none), kept fresh by
// the tab's queries afterwards (a payment, a cancellation, a review show at once). Without the
// server's read (the session's token was refreshing, the API slow) the page reads it here, and a
// 404 then says «سفارش پیدا نشد» in the page.

export const ORDERS_HOME = '/account/orders/'
/** The way up from an order, at every width. */
const UP = { href: ORDERS_HOME, label: 'سفارش‌های من' }

export interface OrderDetailPageProps {
  code: string
  initial: OrderDetail | null
  catalog: PaymentCatalog
  supportPhone: string | null
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <VisuallyHidden role="status">در حال خواندن سفارش</VisuallyHidden>
      <Skeleton className="h-32 rounded-card" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-56 rounded-card" />
    </div>
  )
}

export function OrderDetailPage({ code, initial, catalog, supportPhone }: OrderDetailPageProps) {
  const query = useOrder(code, initial ?? undefined)
  const order = query.data
  const title = `سفارش ${toPersianDigits(code)}`

  if (!order && isApiNotFound(query.error)) {
    // Drawn here, not with EmptyState: importing it from this route regroups the catalog's
    // shared chunks (+0.6 KB gzip on every listing page, measured; the chunk-splitting gotcha).
    return (
      <>
        <AccountPageHeader title="سفارش پیدا نشد" back={UP} />
        <div className="flex flex-col items-center gap-3 rounded-card bg-white px-4 py-12 text-center shadow-card">
          <span
            aria-hidden
            className="mb-2 grid size-20 place-items-center rounded-full bg-brand-50 text-brand-600 [&_svg]:size-9 [&_svg]:stroke-[1.5]"
          >
            <ClipboardX />
          </span>
          <h2 className="text-lg leading-8 font-bold text-ink-900">این سفارش در حساب شما نیست</h2>
          <p className="max-w-md text-base leading-7 text-ink-600">
            کد سفارش را بررسی کنید یا سفارش را از فهرست سفارش‌هایتان باز کنید.
          </p>
          <Link href={ORDERS_HOME} className={buttonClasses({ variant: 'outline' })}>
            سفارش‌های من
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <AccountPageHeader
        title={title}
        back={UP}
        action={
          order && (
            <div className="flex items-center gap-2">
              <CopyCode code={code} />
              <OrderStatusBadge order={order} />
            </div>
          )
        }
      />
      {order ? (
        <OrderView order={order} catalog={catalog} supportPhone={supportPhone} />
      ) : query.isError && !isLoadingSection(query) ? (
        <ListError
          message="سفارش بارگذاری نشد."
          error={query.error}
          errorAt={query.errorUpdatedAt}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <DetailSkeleton />
      )}
    </>
  )
}
