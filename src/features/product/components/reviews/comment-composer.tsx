'use client'

import { CircleCheck, MessageSquarePlus, Reply } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { focusInView } from '@/components/ui/focus-in-view'
import { useFeature } from '@/features/settings/feature-context'
import type { CommentType } from '@/lib/api/types/catalog'
import { QuestionForm } from './question-form'
import { ReviewForm } from './review-form'

const OPEN: Record<CommentType, string> = { comment: 'ثبت دیدگاه', question: 'ثبت پرسش' }
const REPLY = 'پاسخ'
const CLOSED = 'ثبت دیدگاه و پرسش در حال حاضر ممکن نیست.'

export interface CommentComposerProps {
  slug: string
  type: CommentType
  /** Answers this comment: a small «پاسخ» button and a text-only form. */
  parentId?: number
}

/**
 * «ثبت دیدگاه» / «ثبت پرسش» (or «پاسخ» under a question): a button that opens the form in place,
 * below it. Once sent, the form gives way to the API's moderation notice (focused, so it is
 * read out); nothing is added to the list. While the `product_comments` switch is off there is
 * no button, only the operator's reason (none under a reply); the lists stay.
 */
export function CommentComposer({ slug, type, parentId }: CommentComposerProps) {
  const feature = useFeature('product_comments')
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const reply = parentId !== undefined

  useEffect(() => {
    if (open) focusInView(panelRef.current?.querySelector('textarea'))
  }, [open])
  useEffect(() => {
    if (done) focusInView(statusRef.current)
  }, [done])

  if (!feature.enabled) {
    if (reply) return null
    return <p className="text-base text-ink-600">{feature.reason ?? CLOSED}</p>
  }

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }
  const finish = (message: string) => {
    setOpen(false)
    setDone(message)
  }
  const formProps = { slug, parentId, onDone: finish, onCancel: close }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        ref={buttonRef}
        variant={reply ? 'ghost' : 'secondary'}
        size={reply ? 'sm' : 'md'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open)
          setDone(null)
        }}
        iconStart={reply ? <Reply aria-hidden /> : <MessageSquarePlus aria-hidden />}
        className={reply ? '-ms-3.5' : undefined}
      >
        {reply ? REPLY : OPEN[type]}
      </Button>
      <div ref={panelRef} id={panelId} className="w-full empty:hidden">
        {open &&
          (type === 'question' && !reply ? (
            <QuestionForm {...formProps} />
          ) : (
            <ReviewForm {...formProps} />
          ))}
        {done && (
          <p
            ref={statusRef}
            role="status"
            tabIndex={-1}
            className="flex items-start gap-2 rounded-control bg-success/10 px-4 py-3 text-base text-success"
          >
            <CircleCheck aria-hidden className="mt-1 size-5 shrink-0" />
            {done}
          </p>
        )}
      </div>
    </div>
  )
}
