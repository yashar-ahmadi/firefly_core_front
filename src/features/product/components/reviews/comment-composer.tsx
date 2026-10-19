'use client'

import dynamic from 'next/dynamic'
import { ComposerFrame, FormLoading, FormUnavailable } from '@/features/comments/composer-frame'
import { useFeature } from '@/features/settings/feature-context'
import type { CommentType } from '@/lib/api/types/catalog'

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
 * «ثبت دیدگاه» / «ثبت پرسش» (or «پاسخ» under a question): the shared ComposerFrame (a button
 * opening the form in place, then the API's focused moderation notice; nothing is added to the
 * list). While the `product_comments` switch is off there is no button, only the operator's
 * reason (none under a reply); the lists stay.
 */
export function CommentComposer({ slug, type, parentId }: CommentComposerProps) {
  const feature = useFeature('product_comments')
  const reply = parentId !== undefined
  const question = type === 'question' && !reply
  return (
    <ComposerFrame<Pick<CommentComposerProps, 'slug' | 'parentId'>>
      label={reply ? REPLY : OPEN[type]}
      reply={reply}
      closed={feature.enabled ? null : (feature.reason ?? CLOSED)}
      Form={question ? QuestionForm : ReviewForm}
      formProps={{ slug, parentId }}
      preload={() => preload(question)}
    />
  )
}
