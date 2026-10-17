'use client'

import { useId, type ReactNode } from 'react'
import { OtpInput } from '@/components/ui/otp-input'
import type { OtpMethod, OtpSent } from '@/lib/api/types/account'
import { AuthForm } from '@/components/form/auth-form'
import { CodeExpiry, SendCodeButton, useSubmitWait } from '@/components/form/code-timers'
import { SubmitButton } from '@/components/form/submit-button'
import type { Wait } from '@/lib/forms/waits'

/** Where the code goes, the identifier being shown just above: «به این ایمیل», «با پیامک …». */
const DESTINATION: Record<OtpMethod, string> = {
  email: 'به این ایمیل',
  sms: 'با پیامک به این شماره',
  telegram: 'در تلگرامِ این شماره',
}

export interface OtpCodeFormProps {
  /** The code's name: the boxes' group, and «… به این ایمیل فرستاده می‌شود.». */
  codeName: string
  /** The main button's words. */
  submit: string
  channel: OtpMethod
  sent: OtpSent | null
  sends: number
  codeExpiry: Wait
  sendWait: Wait
  /** A 429's wait before the code may be sent again. */
  submitWait: Wait
  code: string
  error?: string
  /** A request is on its way. */
  busy: boolean
  /** It is a code being sent. */
  sending: boolean
  /** Between the line on where the code goes and the boxes (login's «مرا به خاطر بسپار»). */
  children?: ReactNode
  onSend: () => void
  onCode: (code: string) => void
  onSubmit: (code?: string) => void
}

/**
 * The code itself, for every flow that sends one (login, registration, recovery, a contact
 * change): where it goes, then «ارسال کد» until one is sent, then six boxes (sent as soon as
 * they are full), how long it is valid, the main button and «ارسال مجدد کد», each wait the
 * API's own.
 */
export function OtpCodeForm(props: OtpCodeFormProps) {
  const { codeName, submit, channel, sent, sendWait, busy, sending } = props
  const errorId = useId()
  const lock = useSubmitWait(props.submitWait)
  const blocked = busy || lock.locked

  return (
    <>
      <p className="text-base leading-7 text-ink-700">
        {sent === null
          ? `${codeName} ${DESTINATION[channel]} فرستاده می‌شود.`
          : `کد ۶ رقمی ${DESTINATION[sent.otp_method]} فرستاده شد.`}
      </p>
      {/* Chosen before the code is typed: the boxes send it as soon as they are full. */}
      {props.children}
      {sent === null ? (
        <SendCodeButton label="ارسال کد" wait={sendWait} busy={sending} onSend={props.onSend} />
      ) : (
        <AuthForm
          className="gap-4"
          onSubmit={() => {
            if (!blocked) props.onSubmit()
          }}
        >
          <div className="flex flex-col gap-2">
            <p aria-hidden className="text-base font-medium text-ink-800">
              {codeName}
            </p>
            <OtpInput
              key={props.sends}
              autoFocus
              aria-label={codeName}
              aria-describedby={props.error ? errorId : undefined}
              invalid={props.error !== undefined}
              value={props.code}
              onChange={props.onCode}
              onComplete={(code) => {
                if (!blocked) props.onSubmit(code)
              }}
            />
            {props.error && (
              <p id={errorId} className="text-sm leading-6 font-medium text-danger">
                {props.error}
              </p>
            )}
            <CodeExpiry wait={props.codeExpiry} />
          </div>
          <SubmitButton busy={busy && !sending} lock={lock}>
            {submit}
          </SubmitButton>
          <SendCodeButton
            label="ارسال مجدد کد"
            variant="ghost"
            wait={sendWait}
            busy={sending}
            onSend={props.onSend}
          />
        </AuthForm>
      )}
    </>
  )
}
