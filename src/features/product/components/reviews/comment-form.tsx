'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { focusInView } from '@/components/ui/focus-in-view'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { CommentSubmitBody } from '@/lib/api/types/catalog'
import { useSession } from '@/lib/session/session-context'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import {
  commentPayload,
  EMPTY_VALUES,
  placeApiErrors,
  type CommentErrors,
  type CommentMode,
  type CommentValues,
  COMMENT_COPY as COPY,
} from './comment-payload'
import { PointsInput, StarRatingInput } from './review-fields'
import { commentsKey } from './use-comments'

const NAME_MISSING = 'نام خود را بنویسید.'
const DONE = 'نظر شما ثبت شد و پس از تأیید نمایش داده می\u{200C}شود.'
const MAX_TEXT = 4096
const MAX_LINE = 255

export interface CommentFormProps {
  slug: string
  mode: CommentMode
  /** The comment answered (mode `reply`). */
  parentId?: number
  /** After the API accepted it (201): its moderation notice. The fields are reset. */
  onDone: (message: string) => void
  onCancel?: () => void
  /** Focus the text box once mounted (the form was just opened). */
  autoFocus?: boolean
}

/**
 * The one form behind ReviewForm and QuestionForm (product digest §3.13, §8): the text, the
 * name and optional e-mail for guests (a signed-in shopper's come from the account), an
 * off-screen honeypot, and for a root review the stars, a title and the pros and cons. The name
 * and the text are checked here (the API reports a missing name only after every other field
 * passes); the API's field errors go under their fields (`positive_points.1` under the pros),
 * and anything else (no connection, a page that is not the API, too many requests) above the
 * buttons with its own message. A switched-off feature hides the form (CommentComposer).
 */
export function CommentForm({
  slug,
  mode,
  parentId,
  onDone,
  onCancel,
  autoFocus = false,
}: CommentFormProps) {
  const copy = COPY[mode]
  const { hasSession } = useSession()
  const queryClient = useQueryClient()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<CommentValues>(EMPTY_VALUES)
  const [errors, setErrors] = useState<CommentErrors>({})
  // Bumped on each refused attempt: the focus then moves to the first field to fix.
  const [attempt, setAttempt] = useState(0)
  // A signed-in account the API treats as a guest (the session ended): ask for the name.
  const [askName, setAskName] = useState(false)
  const guest = !hasSession || askName
  const review = mode === 'comment'

  useEffect(() => {
    if (autoFocus) focusInView(formRef.current?.querySelector('textarea'))
  }, [autoFocus])

  useEffect(() => {
    if (attempt > 0)
      focusInView(formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]'))
  }, [attempt])

  const refuse = (next: CommentErrors) => {
    setErrors(next)
    setAttempt((count) => count + 1)
  }

  const mutation = useMutation({
    mutationFn: (body: CommentSubmitBody) =>
      bffFetch<Record<string, never>>(`product/detail/${slug}/comment/submit/`, {
        method: 'POST',
        body,
      }),
    onSuccess: ({ msg }) => {
      setValues(EMPTY_VALUES)
      setErrors({})
      // The account summary counts the shopper's comments, questions included (`comment_count`).
      void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY })
      onDone(msg || DONE)
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return refuse({ form: GENERIC_ERROR_DETAIL })
      if (error.isFeatureDisabled()) return markFeatureDisabled('product_comments', error.detail)
      const { errors: placed, parentGone } = placeApiErrors(error.fieldErrors(), mode, error.detail)
      // The API took a signed-in shopper for a guest (the session ended): show the name.
      if (placed.name || placed.email) setAskName(true)
      if (parentGone) void queryClient.invalidateQueries({ queryKey: commentsKey(slug) })
      refuse(placed)
    },
  })

  const set = <K extends keyof CommentValues>(key: K, value: CommentValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mutation.isPending) return
    const local: CommentErrors = {}
    if (!values.review.trim()) local.review = copy.missing
    if (guest && !values.name.trim()) local.name = NAME_MISSING
    if (Object.keys(local).length > 0) return refuse(local)
    setErrors({})
    mutation.mutate(commentPayload(values, { mode, guest, parentId }))
  }

  return (
    <form
      ref={formRef}
      aria-label={copy.title}
      noValidate
      onSubmit={submit}
      className="relative flex max-w-3xl flex-col gap-4"
    >
      {review && (
        <StarRatingInput
          value={values.rating}
          onChange={(rating) => set('rating', rating)}
          error={errors.rating}
        />
      )}
      {review && (
        <Field label="عنوان دیدگاه (اختیاری)" error={errors.title}>
          <Input
            value={values.title}
            maxLength={MAX_LINE}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
      )}
      <Field label={copy.text} error={errors.review} required>
        <Textarea
          value={values.review}
          maxLength={MAX_TEXT}
          rows={4}
          onChange={(e) => set('review', e.target.value)}
        />
      </Field>
      {review && (
        <div className="grid gap-4 md:grid-cols-2">
          <PointsInput
            kind="positive"
            points={values.positive}
            draft={values.positiveDraft}
            onChange={(positive, positiveDraft) =>
              setValues((current) => ({ ...current, positive, positiveDraft }))
            }
            error={errors.positive_points}
          />
          <PointsInput
            kind="negative"
            points={values.negative}
            draft={values.negativeDraft}
            onChange={(negative, negativeDraft) =>
              setValues((current) => ({ ...current, negative, negativeDraft }))
            }
            error={errors.negative_points}
          />
        </div>
      )}
      {guest && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام" error={errors.name} required>
            <Input
              value={values.name}
              maxLength={MAX_LINE}
              autoComplete="name"
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="ایمیل (اختیاری)" hint={'نمایش داده نمی\u{200C}شود.'} error={errors.email}>
            <Input
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              value={values.email}
              maxLength={MAX_LINE}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
      )}
      {/* Honeypot (product digest §3.13): off-screen, unreachable by keyboard and hidden from
          assistive tech; a bot that fills it gets the same answer and nothing is saved. */}
      <div aria-hidden className="absolute start-0 -top-[9999px] h-px w-px overflow-hidden">
        <label>
          {'وب\u{200C}سایت'}
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </label>
      </div>
      {errors.form && (
        <p role="alert" className="flex items-start gap-1.5 text-base font-medium text-danger">
          <CircleAlert aria-hidden className="mt-1 size-5 shrink-0" />
          {errors.form}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={mutation.isPending} className="max-sm:flex-1">
          {copy.send}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            انصراف
          </Button>
        )}
      </div>
    </form>
  )
}
