'use client'

import dynamic from 'next/dynamic'
import { ComposerFrame, FormLoading, FormUnavailable } from '@/features/comments/composer-frame'
import { useFeature } from '@/features/settings/feature-context'
import type { BlogCommentType } from '@/lib/api/types/blog-post'
import type { PostCommentFormProps } from './post-comment-form'

// The form's code loads the first time one is opened (or when the pointer comes near): it stays
// off the post page's first load. A failed download resolves to FormUnavailable (React.lazy
// would throw it to the error boundary).
const PostCommentForm = dynamic(
  () =>
    import('./post-comment-form')
      .then((module) => module.PostCommentForm)
      .catch(() => FormUnavailable),
  { ssr: false, loading: FormLoading },
)
/** A failed download is ignored here: opening the form tries again. */
const preload = () => {
  import('./post-comment-form').catch(() => {})
}

const OPEN: Record<BlogCommentType, string> = { comment: 'ثبت دیدگاه', question: 'ثبت پرسش' }
const CLOSED = 'ثبت دیدگاه و پرسش روی مطالب در حال حاضر ممکن نیست.'

export interface PostCommentComposerProps {
  slug: string
  type: BlogCommentType
  /** Answers this entry: a small «پاسخ» button and the reply form (its type is the entry's). */
  parentId?: number
}

/**
 * «ثبت دیدگاه» / «ثبت پرسش» (or «پاسخ» under an entry), the shared ComposerFrame: a button that
 * opens the form in place, then the API's moderation notice, focused (nothing is added to the
 * list). While the `blog_comments` switch is off there is no button, only the operator's reason
 * (nothing under an entry); the lists stay.
 */
export function PostCommentComposer({ slug, type, parentId }: PostCommentComposerProps) {
  const feature = useFeature('blog_comments')
  const reply = parentId !== undefined
  return (
    <ComposerFrame<Pick<PostCommentFormProps, 'slug' | 'mode' | 'parentId'>>
      label={reply ? 'پاسخ' : OPEN[type]}
      reply={reply}
      closed={feature.enabled ? null : (feature.reason ?? CLOSED)}
      Form={PostCommentForm}
      formProps={{ slug, mode: reply ? 'reply' : type, parentId }}
      preload={preload}
    />
  )
}
