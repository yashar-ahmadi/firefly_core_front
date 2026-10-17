'use client'

import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { AuthForm } from '@/features/auth/components/auth-form'
import { useSubmitWait } from '@/features/auth/components/code-timers'
import { SubmitButton } from '@/features/auth/components/login-fields'
import type { Wait } from '@/features/auth/components/waits'
import type { TotpSetup } from '@/lib/api/types/account'
import { FORM_BUTTON } from './profile-section'
import { SecretKey } from './secret-key'
import { TotpCodeField } from './totp-code-field'

export interface TotpCodeFormProps {
  code: string
  error?: string
  busy: boolean
  /** A 429's wait (`auth_totp_locked`): no code goes until it ends (the boxes stay usable). */
  submitWait: Wait
  submit: string
  variant?: ButtonVariant
  autoFocus?: boolean
  onCode: (code: string) => void
  onSubmit: (code?: string) => void
  onCancel: () => void
}

/** The authenticator's code for enable or disable: sent once the six boxes are full. */
export function TotpCodeForm(props: TotpCodeFormProps) {
  const lock = useSubmitWait(props.submitWait)
  const blocked = props.busy || lock.locked
  return (
    <AuthForm
      className="gap-4"
      onSubmit={() => {
        if (!blocked) props.onSubmit()
      }}
    >
      <TotpCodeField
        value={props.code}
        error={props.error}
        autoFocus={props.autoFocus}
        onChange={props.onCode}
        onComplete={(code) => {
          if (!blocked) props.onSubmit(code)
        }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-1.5">
          <SubmitButton
            busy={props.busy}
            lock={lock}
            size="md"
            variant={props.variant}
            className={FORM_BUTTON}
          >
            {props.submit}
          </SubmitButton>
        </div>
        <Button variant="ghost" onClick={props.onCancel}>
          انصراف
        </Button>
      </div>
    </AuthForm>
  )
}

/** A numbered step of the setup. */
function Step({ number, children }: { number: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-800"
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5 text-base leading-7 text-ink-800">
        {children}
      </div>
    </li>
  )
}

export interface TotpSetupViewProps extends Omit<TotpCodeFormProps, 'submit' | 'variant'> {
  setup: TotpSetup
  notice: ReactNode
}

/**
 * Turning two-step login on (auth digest §4.19): scan the QR code (`qr_code`, a data URL) or
 * type the key, then the code the app shows enables it. The `otpauth://` link is not offered:
 * it would put the secret in a URL.
 */
export function TotpSetupView({ setup, notice, ...form }: TotpSetupViewProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  // The heading takes the focus as the setup opens, so its steps are read from the start.
  useEffect(() => heading.current?.focus(), [])
  return (
    <div className="flex flex-col gap-5 rounded-control border border-ink-200 p-4 sm:p-5">
      <h3
        ref={heading}
        tabIndex={-1}
        className="text-base leading-7 font-bold text-ink-900 outline-none"
      >
        راه‌اندازی برنامهٔ احراز هویت
      </h3>
      {notice}
      <ol className="flex flex-col gap-5">
        <Step number="۱">
          <p>
            برنامهٔ احراز هویت (مانند{' '}
            <bdi dir="ltr" className="whitespace-nowrap">
              Google Authenticator
            </bdi>
            ) را در گوشی باز کنید و این کد QR را با آن اسکن کنید.
          </p>
          {/* The API's own PNG as a data URL: next/image has nothing to optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr_code}
            alt="کد QR برای افزودن حساب به برنامهٔ احراز هویت"
            width={192}
            height={192}
            className="size-48 rounded-control border border-ink-200 bg-white p-2"
          />
        </Step>
        <Step number="۲">
          <p>اگر اسکن ممکن نیست، این کلید را در برنامه وارد کنید:</p>
          <SecretKey secret={setup.secret} />
        </Step>
        <Step number="۳">
          <p>کد ۶ رقمی‌ای را که برنامه نشان می‌دهد وارد کنید.</p>
          <TotpCodeForm {...form} submit="فعال‌سازی" />
        </Step>
      </ol>
      <p className="flex items-start gap-2 rounded-control bg-warning/10 px-4 py-3 text-base leading-7 text-warning">
        <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0" />
        <span>
          این کلید را جای امنی یادداشت کنید. اگر گوشی یا برنامه را از دست بدهید، بدون آن نمی‌توانید
          وارد حساب شوید و باید با پشتیبانی فروشگاه تماس بگیرید.
        </span>
      </p>
    </div>
  )
}
