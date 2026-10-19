'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import { focusInView } from '@/components/ui/focus-in-view'
import { useCommentsClosed, useTakeClosedFocus } from '@/features/comments/comments-gate'
import { ComposerFrame, FormLoading, FormUnavailable } from '@/features/comments/composer-frame'
import type { CommentSubject } from '@/features/comments/subjects'
import type { SubjectCommentType } from '@/lib/api/types/subject-comment'
import type { SubjectCommentFormProps } from './subject-comment-form'

// The form's code loads the first time one is opened (or when the pointer comes near): it stays
// off the page's first load. A failed download resolves to FormUnavailable (React.lazy would
// throw it to the error boundary).
const SubjectCommentForm = dynamic(
  () =>
    import('./subject-comment-form')
      .then((module) => module.SubjectCommentForm)
      .catch(() => FormUnavailable),
  { ssr: false, loading: FormLoading },
)
/** A failed download is ignored here: opening the form tries again. */
const preload = () => {
  import('./subject-comment-form').catch(() => {})
}

const OPEN: Record<SubjectCommentType, string> = { comment: 'ثبت دیدگاه', question: 'ثبت پرسش' }

/**
 * Why the forms are closed, where the root form's button would be. The first one shown after a
 * send closed them takes the focus the form had (the gate's one-shot `takeFocus`); a tab opened
 * later shows its own without taking it.
 */
function ClosedNote({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const takeFocus = useTakeClosedFocus()
  useEffect(() => {
    if (takeFocus()) focusInView(ref.current)
  }, [takeFocus])
  return (
    <p ref={ref} tabIndex={-1} className="rounded-control text-base text-ink-600">
      {text}
    </p>
  )
}

export interface SubjectCommentComposerProps {
  subject: CommentSubject
  type: SubjectCommentType
  /** Answers this entry: a small «پاسخ» button and the reply form (its type is the entry's). */
  parentId?: number
}

/**
 * «ثبت دیدگاه» / «ثبت پرسش» (or «پاسخ» under an entry) for a post or a page, the shared
 * ComposerFrame: a button that opens the form in place, then the API's moderation notice,
 * focused (nothing is added to the list). While the subject's forms are closed
 * (`useCommentsClosed`: a post's `blog_comments` switch, a page's `enable_comments` or a refused
 * send's 403) there is no button, only why (nothing under an entry); the lists stay.
 */
export function SubjectCommentComposer({ subject, type, parentId }: SubjectCommentComposerProps) {
  const closed = useCommentsClosed(subject)
  const reply = parentId !== undefined
  if (closed !== null && !reply) return <ClosedNote text={closed} />
  return (
    <ComposerFrame<Pick<SubjectCommentFormProps, 'subject' | 'mode' | 'parentId'>>
      label={reply ? 'پاسخ' : OPEN[type]}
      reply={reply}
      closed={closed}
      Form={SubjectCommentForm}
      formProps={{ subject, mode: reply ? 'reply' : type, parentId }}
      preload={preload}
    />
  )
}
