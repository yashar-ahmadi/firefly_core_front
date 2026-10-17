'use client'

import type { ReactNode, Ref } from 'react'
import type { OtpMethod } from '@/lib/api/types/account'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { SubmitButton } from '@/components/form/submit-button'
import type { Wait } from '@/lib/forms/waits'
import { AuthCard } from './auth-card'
import { ChannelChoice } from './channel-choice'
import { HandoffLink } from './handoff-link'
import { IdentifierField, TEXT_LINK } from './login-fields'

export interface RecoveryIdentifierStepProps {
  identifier: string
  error?: string
  /** The channels this kind of identifier can take, and the one in use. */
  channels: OtpMethod[]
  channel: OtpMethod | null
  notice: ReactNode
  busy: boolean
  /** Before «ارسال کد بازیابی» may send: a code's wait, or a 429's. */
  wait: Wait
  /** «بازگشت به صفحهٔ ورود» (with `next`): what is typed goes with it, not in it. */
  loginHref: string
  titleRef: Ref<HTMLHeadingElement>
  onIdentifier: (value: string) => void
  onChannel: (channel: OtpMethod) => void
  onSubmit: () => void
}

/**
 * Step 1 of password recovery: the identifier, and the channel when it can take more than one
 * (a mobile number with SMS and Telegram on). The button sends the code at once.
 */
export function RecoveryIdentifierStep(props: RecoveryIdentifierStepProps) {
  const { channels, channel, busy } = props
  const lock = useSubmitWait(props.wait)
  return (
    <AuthCard
      title="بازیابی رمز عبور"
      description="ایمیل یا شماره موبایل حساب خود را وارد کنید تا کد بازیابی برایتان فرستاده شود."
      titleRef={props.titleRef}
    >
      {props.notice}
      <AuthForm
        className="gap-5"
        onSubmit={() => {
          if (!busy && !lock.locked) props.onSubmit()
        }}
      >
        <IdentifierField
          value={props.identifier}
          error={props.error}
          enterKeyHint="send"
          onChange={props.onIdentifier}
        />
        {channel && channels.length > 1 && (
          <ChannelChoice channels={channels} channel={channel} onChannel={props.onChannel} />
        )}
        <SubmitButton busy={busy} lock={lock}>
          ارسال کد بازیابی
        </SubmitButton>
      </AuthForm>
      <p className="text-center">
        <HandoffLink
          page="/login/"
          href={props.loginHref}
          identifier={props.identifier}
          className={TEXT_LINK}
        >
          بازگشت به صفحهٔ ورود
        </HandoffLink>
      </p>
    </AuthCard>
  )
}
