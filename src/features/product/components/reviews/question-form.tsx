'use client'

import { CommentForm } from './comment-form'

export interface QuestionFormProps {
  slug: string
  /** Answers this question: a reply (its type is the question's). */
  parentId?: number
  /** After the API accepted it (201), with its moderation notice; the form is reset. */
  onDone: (message: string) => void
  onCancel?: () => void
}

/**
 * The question form: the text (required) and a guest's name and optional e-mail, sent as
 * `comment_type: 'question'`. Questions carry no stars, title or points.
 */
export function QuestionForm({ slug, parentId, onDone, onCancel }: QuestionFormProps) {
  return (
    <CommentForm
      slug={slug}
      mode={parentId === undefined ? 'question' : 'reply'}
      parentId={parentId}
      onDone={onDone}
      onCancel={onCancel}
    />
  )
}
