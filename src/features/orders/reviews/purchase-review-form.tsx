'use client'

import { Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { FormAlert } from '@/components/form/form-alert'
import { SubmitButton } from '@/components/form/submit-button'
import { useFormFocus } from '@/components/form/use-form-focus'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { announce } from '@/components/ui/live-announcer'
import { Textarea } from '@/components/ui/textarea'
import { PointsInput } from '@/features/product/components/reviews/review-fields'
import { useFeature, useMarkFeatureDisabled } from '@/features/settings/feature-context'
import type { AwaitingReviewProduct } from '@/lib/api/types/order-review'
import { toPersianDigits } from '@/lib/format'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import {
  checkReview,
  EMPTY_REVIEW,
  REVIEW_MAX,
  reviewBody,
  reviewRefusal,
  TITLE_MAX,
  type ReviewErrors,
  type ReviewValues,
} from './review-input'
import { RatingInput } from './rating-input'
import { submitReview } from './reviews-api'

// A purchase's review (order digest §3.1.7, §6.5): the rating (required, five stars), a title
// (optional), the text (required) and the points for and against (up to ten each), with the
// shop's shared form parts (AuthForm: never a native submit; the hydration-gated SubmitButton;
// the first field in error focused). Checked here first, then ONE `POST order/<code>/review/`
// per press. 201 → the API's own sentence goes to the page (`onSubmitted`), which takes the
// purchase off its list. The answers that mean the list is out of date (not in the order,
// reviewed already, not eligible, not this account's) go to the page too (`onStale`). Product
// comments switched off (before, or by a 503 on the press): the submit is disabled with the
// shop's reason, the form kept. A 429 waits on the button.

export interface PurchaseReviewFormProps {
  orderCode: string
  product: AwaitingReviewProduct
  onSubmitted: (message: string) => void
  onStale: (reason: string) => void
}

const OFF = 'ثبت دیدگاه اکنون ممکن نیست.'

export function PurchaseReviewForm({
  orderCode,
  product,
  onSubmitted,
  onStale,
}: PurchaseReviewFormProps) {
  const [values, setValues] = useState<ReviewValues>(EMPTY_REVIEW)
  const [errors, setErrors] = useState<ReviewErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  const sending = useRef(false)
  // Sent: one review per purchase, never a second from this form.
  const done = useRef(false)
  const container = useRef<HTMLDivElement>(null)
  const lock = useSubmitWait(wait)
  const comments = useFeature('product_comments')
  const markFeatureDisabled = useMarkFeatureDisabled()
  const expire = useSessionExpired()
  useFormFocus(container, attempt)
  // The stars come first: a missing rating takes the focus before any other field in error
  // (a radio cannot be `aria-invalid`; its group is).
  useEffect(() => {
    if (attempt === 0) return
    container.current?.querySelector<HTMLElement>('input[data-invalid]')?.focus()
  }, [attempt])

  const set = (changes: Partial<ReviewValues>, field?: keyof ReviewErrors) => {
    setValues((current) => ({ ...current, ...changes }))
    if (field && errors[field])
      setErrors((current) => {
        const next = { ...current }
        delete next[field]
        return next
      })
  }

  async function send() {
    if (sending.current || done.current || lock.locked || !comments.enabled) return
    const problems = checkReview(values)
    if (Object.keys(problems).length > 0) {
      setErrors(problems)
      return setAttempt((count) => count + 1)
    }
    sending.current = true
    setBusy(true)
    setErrors({})
    try {
      const message = await submitReview(orderCode, reviewBody(product.id, values))
      done.current = true
      onSubmitted(message)
    } catch (error) {
      const refusal = reviewRefusal(error)
      if (refusal.kind === 'session') return expire()
      if (refusal.kind === 'stale') return onStale(refusal.message)
      if (refusal.kind === 'feature_off') {
        markFeatureDisabled('product_comments', refusal.reason)
        return announce(refusal.reason)
      }
      if (refusal.kind === 'throttled') {
        setWait((previous) => restartWait(previous, Date.now(), refusal.retryAfter))
        return setErrors({
          form: 'ثبت دیدگاه بیش از حد مجاز تلاش شده است؛ کمی بعد دوباره تلاش کنید.',
        })
      }
      if (refusal.kind === 'fields') {
        setErrors(refusal.errors)
        return setAttempt((count) => count + 1)
      }
      setErrors({ form: refusal.message })
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div ref={container}>
      <AuthForm className="gap-5" onSubmit={() => void send()}>
        <RatingInput
          value={values.rating}
          onChange={(rating) => set({ rating }, 'rating')}
          error={errors.rating}
        />
        <Field
          label={
            <>
              عنوان دیدگاه <span className="font-normal text-ink-600">(اختیاری)</span>
            </>
          }
          error={errors.title}
        >
          <Input
            name="review-title"
            maxLength={TITLE_MAX}
            value={values.title}
            onChange={(event) => set({ title: event.currentTarget.value }, 'title')}
          />
        </Field>
        <Field
          label="متن دیدگاه"
          required
          hint={`حداکثر ${toPersianDigits(REVIEW_MAX)} نویسه.`}
          error={errors.review}
        >
          <Textarea
            name="review-text"
            rows={5}
            maxLength={REVIEW_MAX}
            value={values.review}
            onChange={(event) => set({ review: event.currentTarget.value }, 'review')}
          />
        </Field>
        <PointsInput
          kind="positive"
          points={values.positive}
          draft={values.positiveDraft}
          error={errors.positive_points}
          onChange={(positive, positiveDraft) =>
            set({ positive, positiveDraft }, 'positive_points')
          }
        />
        <PointsInput
          kind="negative"
          points={values.negative}
          draft={values.negativeDraft}
          error={errors.negative_points}
          onChange={(negative, negativeDraft) =>
            set({ negative, negativeDraft }, 'negative_points')
          }
        />
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        {!comments.enabled && (
          <p className="flex items-start gap-2 rounded-control bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800">
            <Info aria-hidden className="mt-1.5 size-4 shrink-0 text-warning" />
            <span>{comments.reason?.trim() || OFF}</span>
          </p>
        )}
        <SubmitButton busy={busy} lock={lock} disabled={!comments.enabled}>
          ثبت دیدگاه
        </SubmitButton>
      </AuthForm>
    </div>
  )
}
