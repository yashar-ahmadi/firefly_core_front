'use client'

import { Download } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ListError } from '@/features/account/lists/list-error'
import { toPersianDigits } from '@/lib/format'
import { useOrderQr } from './orders-api'

// «کد QR» of an account order (order digest §3.1.5): `GET order/<code>/qr-code/` (read when the
// dialog opens, kept for the tab), the API's PNG as it came (a data URL, never redrawn), the value
// it encodes under it (the bare order code, left to right) and a download of the picture (to
// print or keep). Loaded on the first press of «کد QR».

export interface QrDialogProps {
  code: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Only the API's own PNG data URL is shown (nothing else may reach `src`). */
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/

export function QrDialog({ code, open, onOpenChange }: QrDialogProps) {
  const query = useOrderQr(code)
  const qr = query.data && PNG.test(query.data.qr_code) ? query.data : null
  const shown = toPersianDigits(code)

  let body
  if (qr) {
    body = (
      <figure className="flex flex-col items-center gap-3">
        {/* A data URL from the API: next/image has nothing to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr.qr_code}
          alt={`کد QR سفارش ${shown}`}
          width={240}
          height={240}
          className="size-60 rounded-control border border-ink-200 bg-white p-2 [image-rendering:pixelated]"
        />
        <figcaption className="flex flex-col items-center gap-1 text-center">
          <span className="text-sm leading-6 text-ink-600">کد سفارش</span>
          <bdi dir="ltr" className="text-lg font-bold tracking-wider text-ink-900 tabular-nums">
            {toPersianDigits(qr.encoded_value)}
          </bdi>
        </figcaption>
      </figure>
    )
  } else if (query.isError || (query.data && !qr)) {
    body = (
      <ListError
        frame="inline"
        message="کد QR بارگذاری نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else {
    body = (
      <div role="status" aria-label="در حال بارگذاری کد QR" className="flex justify-center">
        <span className="sr-only">در حال بارگذاری کد QR…</span>
        <Skeleton className="size-60 rounded-control" />
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="کد QR سفارش"
        description="این کد را هنگام تحویل یا در فروشگاه نشان دهید؛ شمارهٔ سفارش را در خود دارد."
        size="sm"
        footer={
          qr && (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
              <a
                href={qr.qr_code}
                download={`order-${code}-qr.png`}
                className={buttonClasses({ variant: 'outline' })}
              >
                <Download aria-hidden />
                دانلود تصویر کد
              </a>
            </div>
          )
        }
      >
        {body}
      </DialogContent>
    </Dialog>
  )
}
