'use client'

import { LogOut } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

export interface LogoutAllDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The logout is on its way: the dialog stays, its button busy. */
  pending: boolean
  onConfirm: () => void
}

/**
 * «از همهٔ دستگاه‌ها خارج می‌شوید؟»: a modal dialog (Radix: the focus stays inside, Escape and
 * the backdrop close it, the focus goes back to its opener). It starts on «انصراف», the
 * harmless answer.
 */
export function LogoutAllDialog({ open, onOpenChange, pending, onConfirm }: LogoutAllDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next || pending)}>
      <DialogContent
        size="sm"
        title="از همهٔ دستگاه‌ها خارج می‌شوید؟"
        description="در همهٔ دستگاه‌ها و مرورگرها، از جمله همین‌جا، از حساب خارج می‌شوید و باید دوباره وارد شوید."
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancel.current?.focus()
        }}
        footer={
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button ref={cancel} variant="outline">
                انصراف
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              aria-busy={pending || undefined}
              iconStart={pending ? <Spinner /> : <LogOut aria-hidden />}
              onClick={() => {
                if (!pending) onConfirm()
              }}
            >
              خروج از همه
            </Button>
          </div>
        }
      />
    </Dialog>
  )
}
