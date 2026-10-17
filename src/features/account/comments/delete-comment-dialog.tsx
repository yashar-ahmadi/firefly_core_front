'use client'

import { CircleAlert, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useSubmitWait } from '@/features/auth/components/code-timers'
import type { Wait } from '@/features/auth/components/waits'
import type { MyComment } from '@/lib/api/types/dashboard'
import { SUBJECT_KIND } from './subject-links'

export interface DeleteFailure {
  message: string
  /** A 429: said calmly (no fault), and the delete waits (`wait`). */
  throttled: boolean
}

export interface DeleteCommentDialogProps {
  /** The comment asked about; kept while the dialog closes. */
  comment: MyComment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The delete is on its way: the dialog stays, its button busy. */
  pending: boolean
  /** Why the last try failed, shown in the dialog. */
  failure: DeleteFailure | null
  /** A 429's `retry_after`: «حذف دیدگاه» waits it out. */
  wait: Wait
  onConfirm: () => void
  /** Where the focus goes when the dialog closes after the delete (its row is gone). */
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * «این دیدگاه حذف شود؟»: a modal dialog (focus trapped; Escape and the backdrop close it) that
 * starts on «انصراف», the harmless answer, and says what a delete does: the comment and its
 * replies leave the public page.
 */
export function DeleteCommentDialog({
  comment,
  open,
  onOpenChange,
  pending,
  failure,
  wait,
  onConfirm,
  onCloseAutoFocus,
}: DeleteCommentDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null)
  const lock = useSubmitWait(wait)
  const held = pending || lock.locked
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next || pending)}>
      <DialogContent
        size="sm"
        title="این دیدگاه حذف شود؟"
        description="پس از حذف، دیدگاه و پاسخ‌هایش از صفحه برداشته می‌شوند."
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
              aria-disabled={held || undefined}
              aria-describedby={lock.locked ? lock.noteId : undefined}
              iconStart={pending ? <Spinner /> : <Trash2 aria-hidden />}
              onClick={() => {
                if (!held) onConfirm()
              }}
            >
              حذف دیدگاه
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {comment && (
            <p className="text-base leading-7 text-ink-700">
              دیدگاه شما روی {SUBJECT_KIND[comment.subject_type]}{' '}
              <span dir="auto" className="font-bold text-ink-900">
                «{comment.subject.name}»
              </span>
            </p>
          )}
          {failure && (
            <div
              role="alert"
              className={cn(
                'flex items-start gap-2 rounded-control px-4 py-3 text-base leading-7 font-medium',
                failure.throttled ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger',
              )}
            >
              <CircleAlert aria-hidden className="mt-1.5 size-4 shrink-0" />
              {failure.message}
            </div>
          )}
          {lock.note}
        </div>
      </DialogContent>
    </Dialog>
  )
}
