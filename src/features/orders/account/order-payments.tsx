'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { ListError } from '@/features/account/lists/list-error'
import { isLoadingSection } from '@/features/account/use-account-query'
import { useOrderPayments } from './orders-api'
import { PaymentRow } from './payment-row'

// An order's payments (order digest §3.2.9, §6.4): the detail embeds none, so they are read on
// their own (`GET payment/history/?order_code=`, newest first, with the session), each a row;
// skeletons while they load, a sentence when there is none, «تلاش دوباره» when they cannot be
// read (the rest of the order stays).

export function OrderPayments({ code }: { code: string }) {
  const query = useOrderPayments(code)
  if (isLoadingSection(query)) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only" role="status">
          در حال خواندن پرداخت‌ها
        </span>
        <Skeleton className="h-16 rounded-card" />
      </div>
    )
  }
  if (!query.data) {
    return (
      <ListError
        frame="inline"
        message="پرداخت‌های سفارش بارگذاری نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  }
  const rows = query.data.results
  if (rows.length === 0) {
    return (
      <p className="text-base leading-7 text-ink-700">هنوز پرداختی برای این سفارش ثبت نشده است.</p>
    )
  }
  return (
    <ul aria-label="پرداخت‌های سفارش" className="flex flex-col divide-y divide-ink-100">
      {rows.map((payment) => (
        <PaymentRow key={payment.uuid} payment={payment} />
      ))}
    </ul>
  )
}
