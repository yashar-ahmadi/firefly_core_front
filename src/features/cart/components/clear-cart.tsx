'use client'

import { Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useClearCart } from '../clear-hooks'

const CLEAR = 'حذف همه'

/**
 * «حذف همه», after asking (a modal dialog that starts on «انصراف», the harmless answer): the
 * lines and the coupon go (`cart/clear/`). The dialog stays while the call is on its way. Once
 * the cart is empty the page shows its empty state, whose heading takes the focus
 * (`onCleared`), since the button that opened the dialog has gone with the lines.
 */
export function ClearCartButton({ onCleared }: { onCleared: () => void }) {
  const [open, setOpen] = useState(false)
  const cleared = useRef(false)
  const cancel = useRef<HTMLButtonElement>(null)
  const { clear, isPending } = useClearCart()
  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next || isPending)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" iconStart={<Trash2 aria-hidden />}>
          {CLEAR}
        </Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title={'همه\u{0654} کالاها از سبد خرید حذف شوند؟'}
        description={'کد تخفیف هم از سبد برداشته می\u{200C}شود.'}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancel.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (!cleared.current) return
          cleared.current = false
          event.preventDefault()
          onCleared()
        }}
        footer={
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button ref={cancel} variant="outline" aria-disabled={isPending || undefined}>
                انصراف
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              aria-busy={isPending || undefined}
              iconStart={isPending ? <Spinner /> : <Trash2 aria-hidden />}
              onClick={async () => {
                if (isPending) return
                cleared.current = await clear()
                setOpen(false)
              }}
            >
              {CLEAR}
            </Button>
          </div>
        }
      />
    </Dialog>
  )
}
