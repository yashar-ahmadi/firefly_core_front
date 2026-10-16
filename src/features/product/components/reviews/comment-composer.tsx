'use client'

import { CircleCheck, MessageSquarePlus, Reply } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { focusInView } from '@/components/ui/focus-in-view'
import { Spinner } from '@/components/ui/spinner'
import { useFeature } from '@/features/settings/feature-context'
import type { CommentType } from '@/lib/api/types/catalog'
import { reloadPage } from '@/lib/navigation/hard-navigation'

/** While a form's code arrives (the first open only). */
function FormLoading() {
  return (
    <div className="grid h-40 place-items-center">
      <Spinner size="lg" label="در حال آماده\u{200C}سازی فرم" className="text-brand-600" />
    </div>
  )
}

/**
 * Stands in for a form whose code could not be downloaded (a stale chunk after a deploy, a
 * dropped connection): says so in place, with a reload for fresh code. The rest of the page
 * (and its error boundary) is untouched.
 */
function FormUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-control bg-danger/10 px-4 py-3 text-base text-danger"
    >
      <p>فرم بارگذاری نشد.</p>
      <Button variant="outline" size="sm" onClick={reloadPage}>
        بارگذاری دوباره صفحه
      </Button>
    </div>
  )
}

// The forms' code loads the first time one is opened (or when the pointer comes near). A failed
// download resolves to FormUnavailable: React.lazy would throw it to the error boundary.
const ReviewForm = dynamic(
  () => import('./review-form').then((module) => module.ReviewForm).catch(() => FormUnavailable),
  { ssr: false, loading: FormLoading },
)
const QuestionForm = dynamic(
  () =>
    import('./question-form').then((module) => module.QuestionForm).catch(() => FormUnavailable),
  { ssr: false, loading: FormLoading },
)
/** A failed download is ignored here: opening the form tries again. */
const preload = (question: boolean) => {
  const load = question ? import('./question-form') : import('./review-form')
  load.catch(() => {})
}

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
  const statusRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const reply = parentId !== undefined

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
  const formProps = { slug, parentId, onDone: finish, onCancel: close, autoFocus: true }
  const question = type === 'question' && !reply

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
        onPointerEnter={() => preload(question)}
        onFocus={() => preload(question)}
        iconStart={reply ? <Reply aria-hidden /> : <MessageSquarePlus aria-hidden />}
        className={reply ? '-ms-3.5' : undefined}
      >
        {reply ? REPLY : OPEN[type]}
      </Button>
      <div id={panelId} className="w-full empty:hidden">
        {open && (question ? <QuestionForm {...formProps} /> : <ReviewForm {...formProps} />)}
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
