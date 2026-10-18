'use client'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ListError } from '@/features/account/lists/list-error'
import type { PaymentCatalog } from '@/features/payment/catalog'
import { toPersianDigits } from '@/lib/format'
import { orderActions } from './order-action-rules'
import { useOrder } from './orders-api'
import { PayBody } from './pay-body'

// «پرداخت» and «تأیید سفارش» of an account order (order digest §5.3, §5.8, §6.3): a sheet (a
// bottom sheet on phones) over the list or the order's page, loaded on the first press. The order
// is read for its amounts (the list has none: §6.3), from the cache when the page has it. An order
// that is neither payable nor awaiting its confirmation any more (paid, cancelled meanwhile) is
// said as such, with nothing to press.

export interface PaySheetProps {
  code: string
  catalog: PaymentCatalog
  supportPhone: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NOT_PAYABLE = 'این سفارش اکنون پرداخت یا تأیید نمی\u{200C}شود؛ وضعیت آن به\u{200C}روز شد.'

export function PaySheet({ code, catalog, supportPhone, open, onOpenChange }: PaySheetProps) {
  const query = useOrder(code)
  const order = query.data
  const actions = order ? orderActions(order) : null
  const confirm = actions?.confirm ?? false
  const title = `${confirm ? 'تأیید سفارش' : 'پرداخت سفارش'} ${toPersianDigits(code)}`

  let body
  if (order && actions && (actions.pay || actions.confirm)) {
    body = (
      <PayBody
        order={order}
        catalog={catalog}
        supportPhone={supportPhone}
        onDone={() => onOpenChange(false)}
        onStale={() => void query.refetch()}
      />
    )
  } else if (order) {
    body = (
      <div className="flex flex-col items-start gap-4">
        <p role="status" className="text-base leading-7 text-ink-800">
          {NOT_PAYABLE}
        </p>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          بستن
        </Button>
      </div>
    )
  } else if (query.isError) {
    body = (
      <ListError
        frame="inline"
        message="اطلاعات سفارش خوانده نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else {
    body = (
      <div role="status" aria-label="در حال خواندن سفارش" className="flex flex-col gap-3">
        <span className="sr-only">در حال خواندن سفارش…</span>
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {body}
    </Sheet>
  )
}
