'use client'

import { CircleX } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CancelTransferDialogProps } from './cancel-transfer-dialog'
import { CANCEL_LABEL } from './transfer-copy'

// «انصراف از کارت به کارت» under the receipt form (order digest §5.7 step 6): the button, and its
// confirmation dialog, whose code loads on the first press (the page's first load never carries
// it). Held while a receipt is on its way. A dialog that cannot load says so beside the button.

function DialogUnavailable({ open }: CancelTransferDialogProps) {
  if (!open) return null
  return (
    <p role="alert" className="text-base leading-7 text-danger">
      این بخش بارگذاری نشد؛ صفحه را دوباره باز کنید.
    </p>
  )
}

const CancelTransferDialog = dynamic<CancelTransferDialogProps>(
  () =>
    import('./cancel-transfer-dialog')
      .then((module) => module.CancelTransferDialog)
      .catch(() => DialogUnavailable),
  { ssr: false },
)

export interface CancelTransferProps extends Omit<
  CancelTransferDialogProps,
  'open' | 'onOpenChange'
> {
  /** A receipt is on its way: no cancelling meanwhile. */
  held: boolean
}

export function CancelTransfer({ held, ...props }: CancelTransferProps) {
  const [open, setOpen] = useState(false)
  // Kept once opened: closing then returns the focus to this button.
  const [mounted, setMounted] = useState(false)
  return (
    <div className="flex flex-col items-start gap-2 border-t border-ink-100 pt-4">
      <p className="text-sm leading-6 text-ink-600">
        روش پرداخت دیگری می‌خواهید؟ تا رسیدی ثبت نکرده‌اید می‌توانید از این پرداخت انصراف دهید.
      </p>
      <Button
        variant="ghost"
        className="text-danger hover:bg-danger/10"
        iconStart={<CircleX aria-hidden />}
        aria-haspopup="dialog"
        aria-disabled={held || undefined}
        onClick={() => {
          if (held) return
          setMounted(true)
          setOpen(true)
        }}
      >
        {CANCEL_LABEL}
      </Button>
      {mounted && <CancelTransferDialog {...props} open={open} onOpenChange={setOpen} />}
    </div>
  )
}
