'use client'

import { useId, type ReactNode, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/ui/otp-input'
import type { ContactType, OtpMethod, OtpSent } from '@/lib/api/types/account'
import { AuthCard, OrDivider } from './auth-card'
import { ChannelChoice } from './channel-choice'
import { CodeExpiry, SendCodeButton, useSubmitWait } from './code-timers'
import { IdentifierSummary, RememberMe, SubmitButton } from './login-fields'
import type { Wait } from './waits'

/** Where the code goes, the identifier being shown just above: «به این ایمیل», «با پیامک …». */
const DESTINATION: Record<OtpMethod, string> = {
  email: 'به این ایمیل',
  sms: 'با پیامک به این شماره',
  telegram: 'در تلگرامِ این شماره',
}

/** The words of the step: login's by default; registration and recovery name their code. */
export interface OtpStepCopy {
  title: string
  /** The code's name: the boxes' group, and «… به این ایمیل فرستاده می‌شود.». */
  codeName: string
  submit: string
}

const LOGIN_COPY: OtpStepCopy = {
  title: 'ورود با کد یکبار مصرف',
  codeName: 'کد ورود',
  submit: 'تأیید و ورود',
}

export interface OtpStepProps {
  identifier: string
  type: ContactType | null
  /** The channels the settings offer for this identifier type (at least one). */
  channels: OtpMethod[]
  channel: OtpMethod
  sent: OtpSent | null
  sends: number
  codeExpiry: Wait
  sendWait: Wait
  /** A 429's wait before the code («تأیید و ورود») may be sent again. */
  submitWait: Wait
  code: string
  copy?: OtpStepCopy
  /** «مرا به خاطر بسپار» (login only: shown when `onRemember` is given). */
  rememberMe?: boolean
  error?: string
  notice: ReactNode
  /** A request is on its way. */
  busy: boolean
  /** It is a code being sent. */
  sending: boolean
  /** «ورود با رمز عبور» under the step (login only: shown when this is true). */
  canUsePassword?: boolean
  titleRef: Ref<HTMLHeadingElement>
  onChannel: (channel: OtpMethod) => void
  onSend: () => void
  onCode: (code: string) => void
  onSubmit: (code?: string) => void
  onRemember?: (value: boolean) => void
  onBack: () => void
  onUsePassword?: () => void
}

/**
 * The one-time code step (login, registration, recovery): the channel when there is a choice,
 * «ارسال کد», then six boxes, the timers and «ارسال مجدد کد». Changing the channel changes the
 * next send. «تغییر» goes back to the identifier.
 */
export function OtpStep(props: OtpStepProps) {
  const { identifier, type, channels, channel, sent, sends, sendWait, busy, sending } = props
  const { title, codeName, submit } = props.copy ?? LOGIN_COPY
  const errorId = useId()
  const lock = useSubmitWait(props.submitWait)
  const blocked = busy || lock.locked

  return (
    <AuthCard title={title} titleRef={props.titleRef}>
      <IdentifierSummary identifier={identifier} type={type} onChange={props.onBack} />
      {props.notice}
      {channels.length > 1 && (
        <ChannelChoice channels={channels} channel={channel} onChannel={props.onChannel} />
      )}
      <p className="text-base leading-7 text-ink-700">
        {sent === null
          ? `${codeName} ${DESTINATION[channel]} فرستاده می‌شود.`
          : `کد ۶ رقمی ${DESTINATION[sent.otp_method]} فرستاده شد.`}
      </p>
      {/* Chosen before the code is typed: the boxes send it as soon as they are full. */}
      {props.onRemember && (
        <RememberMe checked={props.rememberMe ?? false} onChange={props.onRemember} />
      )}
      {sent === null ? (
        <SendCodeButton label="ارسال کد" wait={sendWait} busy={sending} onSend={props.onSend} />
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!blocked) props.onSubmit()
          }}
        >
          <div className="flex flex-col gap-2">
            <p aria-hidden className="text-base font-medium text-ink-800">
              {codeName}
            </p>
            <OtpInput
              key={sends}
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
        </form>
      )}
      {props.canUsePassword && props.onUsePassword && (
        <>
          <OrDivider />
          <Button variant="outline" size="lg" fullWidth onClick={props.onUsePassword}>
            ورود با رمز عبور
          </Button>
        </>
      )}
    </AuthCard>
  )
}
