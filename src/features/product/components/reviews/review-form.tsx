'use client'

import { CommentForm } from './comment-form'

export interface ReviewFormProps {
  slug: string
  /** Answers this comment: the form is then text only (no stars, title or points). */
  parentId?: number
  /** After the API accepted it (201), with its moderation notice; the form is reset. */
  onDone: (message: string) => void
  onCancel?: () => void
  /** Focus the text box once mounted. */
  autoFocus?: boolean
}

/**
 * The review form (product digest §3.13, §8): optional stars, a title, the text (required), up
 * to ten pros and ten cons, and a guest's name and optional e-mail; with `parentId`, a reply.
 * Nothing is inserted into the list: the entry waits for moderation.
 */
export function ReviewForm({ slug, parentId, onDone, onCancel, autoFocus }: ReviewFormProps) {
  return (
    <CommentForm
      slug={slug}
      mode={parentId === undefined ? 'comment' : 'reply'}
      parentId={parentId}
      onDone={onDone}
      onCancel={onCancel}
      autoFocus={autoFocus}
    />
  )
}
