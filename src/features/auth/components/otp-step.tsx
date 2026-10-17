'use client'

import { useId, type ReactNode, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/ui/otp-input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { ContactType, OtpMethod, OtpSent } from '@/lib/api/types/account'
import { AuthCard, OrDivider } from './auth-card'
import { CodeExpiry, SendCodeButton, useSubmitWait } from './code-timers'
import { IdentifierSummary, RememberMe, SubmitButton } from './login-fields'
import type { Wait } from './login-types'

const CHANNEL_LABEL: Record<OtpMethod, string> = {
  email: 'ایمیل',
  sms: 'پیامک',
  telegram: 'تلگرام',
}

/** Where the code goes, the identifier being shown just above: «به این ایمیل», «با پیامک …». */
const DESTINATION: Record<OtpMethod, string> = {
  email: 'به این ایمیل',
  sms: 'با پیامک به این شماره',
  telegram: 'در تلگرامِ این شماره',
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
  /** A 429's wait before «تأیید و ورود» may be sent again. */
  submitWait: Wait
  code: string
  rememberMe: boolean
  error?: string
  notice: ReactNode
  /** A request is on its way. */
  busy: boolean
  /** It is a code being sent. */
  sending: boolean
  canUsePassword: boolean
  titleRef: Ref<HTMLHeadingElement>
  onChannel: (channel: OtpMethod) => void
  onSend: () => void
  onCode: (code: string) => void
  onSubmit: (code?: string) => void
  onRemember: (value: boolean) => void
  onBack: () => void
  onUsePassword: () => void
}

/** Step 2 with a code: the channel, «ارسال کد», then six boxes, the timers and «ارسال مجدد». */
export function OtpStep(props: OtpStepProps) {
  const { identifier, type, channels, channel, sent, sends, sendWait, busy, sending } = props
  const errorId = useId()
  const lock = useSubmitWait(props.submitWait)
  const blocked = busy || lock.locked

  return (
    <AuthCard title="ورود با کد یکبار مصرف" titleRef={props.titleRef}>
      <IdentifierSummary identifier={identifier} type={type} onChange={props.onBack} />
      {props.notice}
      {channels.length > 1 && (
        <RadioGroup
          aria-label="روش دریافت کد"
          value={channel}
          onValueChange={(value) => props.onChannel(value as OtpMethod)}
          className="grid-cols-2"
        >
          {channels.map((option) => (
            <RadioGroupItem
              key={option}
              value={option}
              label={CHANNEL_LABEL[option]}
              variant="card"
            />
          ))}
        </RadioGroup>
      )}
      <p className="text-base leading-7 text-ink-700">
        {sent === null
          ? `کد ورود ${DESTINATION[channel]} فرستاده می‌شود.`
          : `کد ۶ رقمی ${DESTINATION[sent.otp_method]} فرستاده شد.`}
      </p>
      {/* Chosen before the code is typed: the boxes send it as soon as they are full. */}
      <RememberMe checked={props.rememberMe} onChange={props.onRemember} />
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
              کد ورود
            </p>
            <OtpInput
              key={sends}
              autoFocus
              aria-label="کد ورود"
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
            تأیید و ورود
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
      {props.canUsePassword && (
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
