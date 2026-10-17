'use client'

import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import type { ContactType, OtpMethod, OtpSent } from '@/lib/api/types/account'
import { AuthCard, OrDivider } from './auth-card'
import { ChannelChoice } from './channel-choice'
import { IdentifierSummary, RememberMe } from './login-fields'
import { OtpCodeForm } from './otp-code-form'
import type { Wait } from './waits'

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
 * «ارسال کد», then six boxes, the timers and «ارسال مجدد کد» (`OtpCodeForm`). Changing the
 * channel changes the next send. «تغییر» goes back to the identifier.
 */
export function OtpStep(props: OtpStepProps) {
  const { identifier, type, channels, channel } = props
  const { title, codeName, submit } = props.copy ?? LOGIN_COPY

  return (
    <AuthCard title={title} titleRef={props.titleRef}>
      <IdentifierSummary identifier={identifier} type={type} onChange={props.onBack} />
      {props.notice}
      {channels.length > 1 && (
        <ChannelChoice channels={channels} channel={channel} onChannel={props.onChannel} />
      )}
      <OtpCodeForm
        codeName={codeName}
        submit={submit}
        channel={channel}
        sent={props.sent}
        sends={props.sends}
        codeExpiry={props.codeExpiry}
        sendWait={props.sendWait}
        submitWait={props.submitWait}
        code={props.code}
        error={props.error}
        busy={props.busy}
        sending={props.sending}
        onSend={props.onSend}
        onCode={props.onCode}
        onSubmit={props.onSubmit}
      >
        {props.onRemember && (
          <RememberMe checked={props.rememberMe ?? false} onChange={props.onRemember} />
        )}
      </OtpCodeForm>
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
