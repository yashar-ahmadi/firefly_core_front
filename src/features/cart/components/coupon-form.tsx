'use client'

import { CircleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useSubmitWait } from '@/components/form/code-timers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { THROTTLED_MESSAGE, throttleWait } from '@/features/account/lists/list-error'
import { ApiError } from '@/lib/api/errors'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { errorDetail } from '../cart-cache'
import { COUPON_MAX_LENGTH, isCartGone, normaliseCouponCode, useApplyCoupon } from '../coupon-hooks'

const EMPTY_CODE = 'کد تخفیف را وارد کنید.'

interface Failure {
  message: string
  /** A 429's wait counts from here (`retry_after`). */
  error: unknown
  /** When it came: also the alert's key, so the same words said again are read out again. */
  at: number
}

export interface CouponFormProps {
  /** After the shopper's remove: the field takes the focus. */
  focus: boolean
  onApplied: () => void
  /** `503 feature_disabled`: the operator's sentence takes the form's place. */
  onSwitchedOff: (detail: string) => void
}

/**
 * The code field and «اعمال کد». The code is sent as the API reads it (Latin digits, trimmed,
 * upper case). A refusal shows the API's detail under the field, the code kept for editing, as an
 * alert read out once per answer (the focus stays where it is); a 429 says calmly to wait, and
 * «اعمال کد» waits out `retry_after` (focusable, inert, described by the time left). A session
 * that is gone ends here too (`useSessionExpired`).
 */
export function CouponForm({ focus, onApplied, onSwitchedOff }: CouponFormProps) {
  const fieldId = useId()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [failure, setFailure] = useState<Failure | null>(null)
  const { apply, isPending } = useApplyCoupon()
  const expire = useSessionExpired()
  const lock = useSubmitWait(throttleWait(failure?.error, failure?.at ?? 0))
  useEffect(() => {
    if (focus) input.current?.focus()
  }, [focus])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (isPending || lock.locked) return
    const code = normaliseCouponCode(value)
    if (code === '') return setFailure({ message: EMPTY_CODE, error: null, at: Date.now() })
    try {
      await apply(code)
      onApplied()
    } catch (error) {
      if (error instanceof ApiError && error.isFeatureDisabled()) return onSwitchedOff(error.detail)
      // The cart is gone (read again: the page shows it empty); nothing to say here.
      if (isCartGone(error)) return setFailure(null)
      if (isSessionExpiredError(error)) expire()
      const throttled = error instanceof ApiError && error.status === 429
      const message = throttled ? THROTTLED_MESSAGE : errorDetail(error)
      setFailure({ message, error, at: Date.now() })
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-base font-medium text-ink-800">
        کد تخفیف دارید؟
      </label>
      <div className="flex items-start gap-2">
        <Input
          ref={input}
          id={fieldId}
          dir="ltr"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={COUPON_MAX_LENGTH}
          aria-invalid={failure ? true : undefined}
          aria-describedby={failure ? errorId : undefined}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-12 shrink-0"
          aria-busy={isPending || undefined}
          aria-disabled={lock.locked || undefined}
          aria-describedby={lock.locked ? lock.noteId : undefined}
          iconStart={isPending ? <Spinner size="sm" /> : undefined}
        >
          اعمال کد
        </Button>
      </div>
      {failure && (
        <p
          key={failure.at}
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm leading-6 font-medium text-danger"
        >
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{failure.message}</span>
        </p>
      )}
      {lock.note}
    </form>
  )
}
