'use client'

import { Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { FormAlert } from '@/features/auth/components/auth-card'
import type { Address } from '@/lib/api/types/address'

export interface DeleteAddressDialogProps {
  /** The address asked about; kept while the dialog closes. */
  address: Address | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The delete is on its way: the dialog stays, its button busy. */
  pending: boolean
  /** The cart's checkout destination is this address. */
  inCart: boolean
  /** Why the last try failed, shown in the dialog. */
  error: string | null
  onConfirm: () => void
  /** Where the focus goes when the dialog closes after the delete (its opener is gone). */
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * «آدرس … حذف شود؟»: a modal dialog (focus trapped; Escape and the backdrop close it) that starts
 * on «انصراف», the harmless answer. It says what else changes: the default moves to the newest
 * other address, and a checkout that was going to this address needs another.
 */
export function DeleteAddressDialog({
  address,
  open,
  onOpenChange,
  pending,
  inCart,
  error,
  onConfirm,
  onCloseAutoFocus,
}: DeleteAddressDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null)
  const notes = [
    'این آدرس از فهرست آدرس‌های شما برداشته می‌شود.',
    address?.is_default && 'آدرس پیش‌فرض شماست؛ پس از حذف، جدیدترین آدرس دیگرتان پیش‌فرض می‌شود.',
    inCart && 'این آدرس برای ارسال سفارش فعلی انتخاب شده است؛ پس از حذف، آدرس دیگری انتخاب کنید.',
  ].filter(Boolean)
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next || pending)}>
      <DialogContent
        size="sm"
        title={`آدرس «${address?.title ?? ''}» حذف شود؟`}
        description={notes.join(' ')}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancel.current?.focus()
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button ref={cancel} variant="outline" aria-disabled={pending || undefined}>
                انصراف
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              aria-busy={pending || undefined}
              iconStart={pending ? <Spinner /> : <Trash2 aria-hidden />}
              onClick={() => {
                if (!pending) onConfirm()
              }}
            >
              حذف آدرس
            </Button>
          </div>
        }
      >
        {error ? <FormAlert>{error}</FormAlert> : undefined}
      </DialogContent>
    </Dialog>
  )
}
