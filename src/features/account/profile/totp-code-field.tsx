'use client'

import { useId } from 'react'
import { OtpInput } from '@/components/ui/otp-input'

const LABEL = 'کد برنامهٔ احراز هویت'

export interface TotpCodeFieldProps {
  value: string
  error?: string
  /** Under the boxes; the authenticator's habits by default. */
  hint?: string
  autoFocus?: boolean
  onChange: (code: string) => void
  /** The six digits are in (the code's own form sends then; a form with more fields does not). */
  onComplete?: (code: string) => void
}

/**
 * «کد برنامهٔ احراز هویت»: six boxes (`one-time-code`, Persian and Arabic digits taken), named
 * and described as one group, its message under it.
 */
export function TotpCodeField({
  value,
  error,
  hint = 'کد برنامه هر ۳۰ ثانیه عوض می‌شود؛ اگر پذیرفته نشد، کد بعدی را وارد کنید و از درست بودن ساعت گوشی مطمئن شوید.',
  autoFocus = false,
  onChange,
  onComplete,
}: TotpCodeFieldProps) {
  const errorId = useId()
  const hintId = useId()
  return (
    <div className="flex flex-col gap-2">
      <p aria-hidden className="text-base font-medium text-ink-800">
        {LABEL}
      </p>
      <OtpInput
        autoFocus={autoFocus}
        aria-label={LABEL}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        invalid={error !== undefined}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
      />
      {error && (
        <p id={errorId} className="text-sm leading-6 font-medium text-danger">
          {error}
        </p>
      )}
      <p id={hintId} className="text-sm leading-6 text-ink-600">
        {hint}
      </p>
    </div>
  )
}
