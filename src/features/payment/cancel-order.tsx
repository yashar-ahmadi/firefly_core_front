'use client'

import { CircleX } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CancelOrderDialogProps } from './cancel-order-dialog'

// «لغو سفارش» on the payment link's page (order digest §3.1.10; shown while `can_cancel`): the
// button, and its confirmation dialog, whose code loads on the first press (the page's first
// load never carries it). A dialog that cannot load says so beside the button.

function DialogUnavailable({ open }: CancelOrderDialogProps) {
  if (!open) return null
  return (
    <p role="alert" className="text-base leading-7 text-danger">
      این بخش بارگذاری نشد؛ صفحه را دوباره باز کنید.
    </p>
  )
}

const CancelOrderDialog = dynamic<CancelOrderDialogProps>(
  () =>
    import('./cancel-order-dialog')
      .then((module) => module.CancelOrderDialog)
      .catch(() => DialogUnavailable),
  { ssr: false },
)

export function CancelOrder(props: Omit<CancelOrderDialogProps, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(false)
  // Kept once opened: closing then returns the focus to this button.
  const [mounted, setMounted] = useState(false)
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="ghost"
        className="text-danger hover:bg-danger/10"
        iconStart={<CircleX aria-hidden />}
        aria-haspopup="dialog"
        onClick={() => {
          setMounted(true)
          setOpen(true)
        }}
      >
        لغو سفارش
      </Button>
      {mounted && <CancelOrderDialog {...props} open={open} onOpenChange={setOpen} />}
    </div>
  )
}
