'use client'

import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleX, CreditCard, QrCode, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { PaymentCatalog } from '@/features/payment/catalog'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { useReorder } from '../reorder/use-reorder'
import { orderActions } from './order-action-rules'
import { LazyCancelDialog, LazyPaySheet, LazyQrDialog, useOverlay } from './order-overlays'
import { ordersChanged } from './orders-api'

// An account order's actions on its page (order digest §6.1, §6.4): «پرداخت» while it owes online
// money, «تأیید سفارش» for a pure pay-on-delivery order awaiting its confirmation (both the pay
// sheet, through the owner's uuid door), «خرید دوباره» (always: any status), «کد QR» (always) and
// «لغو سفارش» while it may be cancelled (secondary, last). The sheet and the dialogs load on the
// first press. A cancellation shows the API's own order at once; anything else reads it again.

export interface OrderActionsProps {
  order: OrderDetail
  catalog: PaymentCatalog
  supportPhone?: string | null
}

export function OrderActions({ order, catalog, supportPhone = null }: OrderActionsProps) {
  const client = useQueryClient()
  const code = order.order_code
  const rules = orderActions(order)
  const pay = useOverlay()
  const cancel = useOverlay()
  const qr = useOverlay()
  const again = useReorder()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {rules.pay && (
          <Button aria-haspopup="dialog" iconStart={<CreditCard aria-hidden />} onClick={pay.show}>
            پرداخت
          </Button>
        )}
        {rules.confirm && (
          <Button aria-haspopup="dialog" iconStart={<CircleCheck aria-hidden />} onClick={pay.show}>
            تأیید سفارش
          </Button>
        )}
        <Button
          variant="outline"
          aria-disabled={again.busy || again.lock.locked || undefined}
          aria-busy={again.busy || undefined}
          aria-describedby={again.lock.locked ? again.lock.noteId : undefined}
          iconStart={again.busy ? <Spinner size="sm" /> : <RotateCcw aria-hidden />}
          onClick={() => again.reorder(code)}
        >
          خرید دوباره
        </Button>
        <Button
          variant="outline"
          aria-haspopup="dialog"
          iconStart={<QrCode aria-hidden />}
          onClick={qr.show}
        >
          کد QR
        </Button>
        {rules.cancel && (
          <Button
            variant="ghost"
            aria-haspopup="dialog"
            className="text-danger hover:bg-danger/10"
            iconStart={<CircleX aria-hidden />}
            onClick={cancel.show}
          >
            لغو سفارش
          </Button>
        )}
      </div>
      {again.lock.note}
      {pay.requested && (
        <LazyPaySheet
          code={code}
          catalog={catalog}
          supportPhone={supportPhone}
          open={pay.open}
          onOpenChange={pay.setOpen}
        />
      )}
      {cancel.requested && (
        <LazyCancelDialog
          code={code}
          open={cancel.open}
          onOpenChange={cancel.setOpen}
          onCancelled={(cancelled) => ordersChanged(client, { code, order: cancelled })}
          onStale={() => ordersChanged(client, { code })}
        />
      )}
      {qr.requested && <LazyQrDialog code={code} open={qr.open} onOpenChange={qr.setOpen} />}
    </div>
  )
}
