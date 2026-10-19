'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { FormAlert } from '@/components/form/form-alert'
import { SubmitButton } from '@/components/form/submit-button'
import { useFormFocus } from '@/components/form/use-form-focus'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  EMPTY_POST_COMMENT,
  postCommentBody,
  postCommentFailure,
  type PostCommentErrors,
  type PostCommentMode,
  type PostCommentValues,
} from '@/features/blog/post-comment-payload'
import { postCommentsKey } from '@/features/blog/post-comments-api'
import type { ComposerFormProps } from '@/features/comments/composer-frame'
import { COMMENT_COPY } from '@/features/comments/form-copy'
import {
  GuestFields,
  HoneypotField,
  MAX_COMMENT_TEXT,
  NAME_MISSING,
} from '@/features/comments/form-fields'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import { bffFetch } from '@/lib/api/client'
import type { BlogCommentSubmitBody } from '@/lib/api/types/blog-post'
import type { FeatureKey } from '@/lib/api/types/common'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { useSession } from '@/lib/session/session-context'
import { MY_COMMENTS_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'

const DONE = 'نظر شما ثبت شد و پس از تأیید نمایش داده می\u{200C}شود.'

export interface PostCommentFormProps extends ComposerFormProps {
  slug: string
  mode: PostCommentMode
  /** The comment answered (mode `reply`). */
  parentId?: number
}

/**
 * The blog's comment, question or reply form (blog digest §1.7), opened by PostCommentComposer
 * (its code loads on the first open). The text (≤ 4096), a guest's name (≤ 255) and optional
 * e-mail (a signed-in visitor's come from the account), the honeypot, every empty optional left
 * out. The text and a guest's name are checked here first; the API's errors go under their
 * fields (several at once), the rest above the button; a 429 holds the button for `retry_after`;
 * a switched-off switch (`blog_comments`, `blog`) turns the feature off, which takes the form
 * away. Once accepted (201), the API's moderation notice: nothing is inserted into the list.
 * Never submits natively (AuthForm).
 */
export function PostCommentForm({
  slug,
  mode,
  parentId,
  onDone,
  onCancel,
  autoFocus = false,
}: PostCommentFormProps) {
  const copy = COMMENT_COPY[mode]
  const { hasSession } = useSession()
  const client = useQueryClient()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const frameRef = useRef<HTMLDivElement>(null)
  const [values, setValues] = useState<PostCommentValues>(EMPTY_POST_COMMENT)
  const [errors, setErrors] = useState<PostCommentErrors>({})
  // Bumped on each refused attempt: the focus then moves to the first field to fix.
  const [attempt, setAttempt] = useState(0)
  // A signed-in account the API treats as a guest (the session ended): ask for the name.
  const [askName, setAskName] = useState(false)
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  const lock = useSubmitWait(wait)
  const guest = !hasSession || askName
  useFormFocus(frameRef, attempt)

  useEffect(() => {
    if (autoFocus) frameRef.current?.querySelector('textarea')?.focus()
  }, [autoFocus])

  const refuse = (next: PostCommentErrors) => {
    setErrors(next)
    setAttempt((count) => count + 1)
  }

  const mutation = useMutation({
    mutationFn: (body: BlogCommentSubmitBody) =>
      bffFetch<Record<string, never>>(`blog/post/${slug}/comment/submit/`, {
        method: 'POST',
        body,
      }),
    onSuccess: ({ msg }) => {
      setValues(EMPTY_POST_COMMENT)
      setErrors({})
      // The account's summary counts the visitor's comments, and «دیدگاه‌های من» lists them.
      void client.invalidateQueries({ queryKey: SUMMARY_KEY })
      void client.invalidateQueries({ queryKey: MY_COMMENTS_KEY })
      onDone(msg || DONE)
    },
    onError: (error) => {
      const failure = postCommentFailure(error)
      if (failure.feature) {
        return markFeatureDisabled(failure.feature.key as FeatureKey, failure.feature.reason)
      }
      if (failure.askName) setAskName(true)
      if (failure.parentGone) void client.invalidateQueries({ queryKey: postCommentsKey(slug) })
      const seconds = failure.waitSeconds
      if (seconds) setWait((previous) => restartWait(previous, Date.now(), seconds))
      refuse(failure.errors)
    },
  })

  const set = (key: keyof PostCommentValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

  const submit = () => {
    if (mutation.isPending || lock.locked) return
    const local: PostCommentErrors = {}
    if (!values.review.trim()) local.review = copy.missing
    if (guest && !values.name.trim()) local.name = NAME_MISSING
    if (Object.keys(local).length > 0) return refuse(local)
    setErrors({})
    mutation.mutate(postCommentBody(values, { mode, guest, parentId }))
  }

  return (
    <div ref={frameRef} className="relative max-w-3xl">
      <AuthForm onSubmit={submit} label={copy.title} className="gap-4">
        <Field label={copy.text} error={errors.review} required>
          <Textarea
            value={values.review}
            maxLength={MAX_COMMENT_TEXT}
            rows={4}
            onChange={(e) => set('review', e.target.value)}
          />
        </Field>
        {guest && (
          <GuestFields
            name={values.name}
            email={values.email}
            errors={errors}
            onName={(name) => set('name', name)}
            onEmail={(email) => set('email', email)}
          />
        )}
        <HoneypotField value={values.website} onChange={(website) => set('website', website)} />
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-col gap-1 max-sm:flex-1 sm:w-48">
            <SubmitButton busy={mutation.isPending} lock={lock} size="md">
              {copy.send}
            </SubmitButton>
          </div>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              انصراف
            </Button>
          )}
        </div>
      </AuthForm>
    </div>
  )
}
