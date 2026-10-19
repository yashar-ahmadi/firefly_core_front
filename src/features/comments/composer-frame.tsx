'use client'

import { CircleCheck, MessageSquarePlus, Reply } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ComponentType } from 'react'
import { Button } from '@/components/ui/button'
import { focusInView } from '@/components/ui/focus-in-view'
import { Spinner } from '@/components/ui/spinner'
import { reloadPage } from '@/lib/navigation/hard-navigation'

// «ثبت دیدگاه» and its kind for every comment form of the shop (a product's, a blog post's): a
// button that opens the form in place, its code loaded on the first open (`next/dynamic` in the
// caller), and the API's moderation notice once it is sent.

/** While a form's code arrives (the first open only). */
export function FormLoading() {
  return (
    <div className="grid h-40 place-items-center">
      <Spinner size="lg" label={'در حال آماده\u{200C}سازی فرم'} className="text-brand-600" />
    </div>
  )
}

/**
 * Stands in for a form whose code could not be downloaded (a stale chunk after a deploy, a
 * dropped connection): says so in place, with a reload for fresh code. The rest of the page
 * (and its error boundary) is untouched.
 */
export function FormUnavailable() {
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

/** What the frame gives the form it opens. */
export interface ComposerFormProps {
  /** After the API accepted it (201): its moderation notice. */
  onDone: (message: string) => void
  /** «انصراف»: the frame closes the form and gives the focus back to its button. */
  onCancel?: () => void
  /** Focus the text box once mounted (the frame opens it with true). */
  autoFocus?: boolean
}

export interface ComposerFrameProps<P> {
  /** The button's words («ثبت دیدگاه», «ثبت پرسش»); a reply's is «پاسخ». */
  label: string
  /** Answers an entry: a small «پاسخ» button. */
  reply: boolean
  /** The comments switch is off: its reason (none under a reply), and no button. */
  closed: string | null
  /** The form (a `next/dynamic` component: its code loads on the first open). */
  Form: ComponentType<P & ComposerFormProps>
  /** Its own props. */
  formProps: P
  /** Starts the form's download early (pointer near, focus). Never rejects. */
  preload: () => void
}

/**
 * A button that opens the form in place, below it. Once sent, the form gives way to the API's
 * moderation notice (focused, so it is read out); nothing is added to the list. While comments
 * are switched off there is no button, only the reason (none under a reply).
 */
export function ComposerFrame<P>({
  label,
  reply,
  closed,
  Form,
  formProps,
  preload,
}: ComposerFrameProps<P>) {
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (done) focusInView(statusRef.current)
  }, [done])

  if (closed !== null) {
    if (reply) return null
    return <p className="text-base text-ink-600">{closed}</p>
  }

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }
  const finish = (message: string) => {
    setOpen(false)
    setDone(message)
  }

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
        onPointerEnter={preload}
        onFocus={preload}
        iconStart={reply ? <Reply aria-hidden /> : <MessageSquarePlus aria-hidden />}
        className={reply ? '-ms-3.5' : undefined}
      >
        {label}
      </Button>
      <div id={panelId} className="w-full empty:hidden">
        {open && <Form {...formProps} onDone={finish} onCancel={close} autoFocus />}
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
