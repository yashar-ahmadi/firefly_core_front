'use client'

import { useId, type ReactNode, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/ui/otp-input'
import { AuthCard } from './auth-card'
import { useSubmitWait } from './code-timers'
import { SubmitButton } from './login-fields'
import type { Wait } from './login-types'

export interface TotpStepProps {
  code: string
  error?: string
  notice: ReactNode
  busy: boolean
  /** A 429's wait (`auth_totp_locked`): no code is sent until it ends (the boxes stay usable). */
  submitWait: Wait
  titleRef: Ref<HTMLHeadingElement>
  onCode: (code: string) => void
  onSubmit: (code?: string) => void
  onBack: () => void
}

/** The second step of a login with two-step verification on: the authenticator's six digits. */
export function TotpStep({
  code,
  error,
  notice,
  busy,
  submitWait,
  titleRef,
  onCode,
  onSubmit,
  onBack,
}: TotpStepProps) {
  const hintId = useId()
  const errorId = useId()
  const lock = useSubmitWait(submitWait)
  const blocked = busy || lock.locked
  return (
    <AuthCard
      title="تأیید دومرحله‌ای"
      description="ورود دومرحله‌ای برای حساب شما فعال است."
      titleRef={titleRef}
    >
      {notice}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!blocked) onSubmit()
        }}
      >
        <p className="text-base leading-7 text-ink-700">
          برنامهٔ احراز هویت را در گوشی خود باز کنید (مانند{' '}
          <bdi dir="ltr" className="whitespace-nowrap">
            Google Authenticator
          </bdi>
          ) و کد ۶ رقمی آن را وارد کنید.
        </p>
        <div className="flex flex-col gap-2">
          <p aria-hidden className="text-base font-medium text-ink-800">
            کد برنامهٔ احراز هویت
          </p>
          <OtpInput
            autoFocus
            aria-label="کد برنامهٔ احراز هویت"
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            invalid={error !== undefined}
            value={code}
            onChange={onCode}
            onComplete={(value) => {
              if (!blocked) onSubmit(value)
            }}
          />
          {error && (
            <p id={errorId} className="text-sm leading-6 font-medium text-danger">
              {error}
            </p>
          )}
          <p id={hintId} className="text-sm leading-6 text-ink-600">
            کد هر ۳۰ ثانیه عوض می‌شود. اگر پذیرفته نشد، کد بعدی را وارد کنید و از درست بودن ساعت
            گوشی مطمئن شوید.
          </p>
        </div>
        <SubmitButton busy={busy} lock={lock}>
          تأیید و ورود
        </SubmitButton>
      </form>
      <Button variant="ghost" size="lg" fullWidth onClick={onBack}>
        بازگشت
      </Button>
    </AuthCard>
  )
}
