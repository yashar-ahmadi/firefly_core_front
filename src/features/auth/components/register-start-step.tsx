'use client'

import Link from 'next/link'
import type { ReactNode, Ref } from 'react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ContactType, OtpMethod } from '@/lib/api/types/account'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { SubmitButton } from '@/components/form/submit-button'
import type { Wait } from '@/lib/forms/waits'
import { AuthCard } from './auth-card'
import { ChannelChoice } from './channel-choice'
import type { CodeFlowField } from './code-flow-types'
import { HandoffLink } from './handoff-link'
import { TEXT_LINK } from './login-fields'
import type { RegisterEntry } from './use-register-actions'

const METHOD_NAME: Record<ContactType, string> = { email: 'ایمیل', phone: 'شمارهٔ موبایل' }

export interface RegisterStartStepProps {
  /** `registration_methods`: a tab each when there are two. */
  methods: ContactType[]
  entry: RegisterEntry
  /** The channels the chosen method can take, and the one in use. */
  channels: OtpMethod[]
  channel: OtpMethod | null
  errors: Partial<Record<CodeFlowField, string>>
  /** The identifier belongs to an account already: «ورود» with it (handed over, not in the URL). */
  identifierTaken: boolean
  /** The login page (with `next`): «وارد شوید», and «ورود» with a taken identifier. */
  loginHref: string
  notice: ReactNode
  busy: boolean
  /** Before «دریافت کد تأیید» may send: a code's wait, or a 429's. */
  wait: Wait
  /** The operator's terms, sanitised on the server. */
  termsHtml: string | null
  titleRef: Ref<HTMLHeadingElement>
  onEntry: (changes: Partial<RegisterEntry>, field: CodeFlowField, destination?: boolean) => void
  onChannel: (channel: OtpMethod) => void
  onSubmit: () => void
}

/** The identifier of one method: an email address, or a mobile number and its channel. */
function IdentifierInput(props: RegisterStartStepProps & { method: ContactType }) {
  const { method, entry, errors, channels, channel, identifierTaken } = props
  const email = method === 'email'
  return (
    <>
      <div className="flex flex-col gap-1">
        <Field
          label={METHOD_NAME[method]}
          hint={email ? undefined : 'مثلاً ۰۹۱۲۳۴۵۶۷۸۹'}
          error={errors.identifier}
        >
          <Input
            dir="ltr"
            type={email ? 'email' : 'tel'}
            name={email ? 'email' : 'tel'}
            autoComplete={email ? 'email' : 'tel'}
            inputMode={email ? 'email' : 'tel'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            value={entry[method]}
            onChange={(event) => {
              const value = event.currentTarget.value
              props.onEntry(email ? { email: value } : { phone: value }, 'identifier', true)
            }}
          />
        </Field>
        {identifierTaken && (
          <HandoffLink
            page="/login/"
            href={props.loginHref}
            identifier={entry[method]}
            className={TEXT_LINK}
          >
            {email ? 'ورود با همین ایمیل' : 'ورود با همین شماره'}
          </HandoffLink>
        )}
      </div>
      {!email && channel && channels.length > 1 && (
        <ChannelChoice channels={channels} channel={channel} onChannel={props.onChannel} />
      )}
    </>
  )
}

/** Step 1: the names, the method (tabs, when there are two), the identifier and its channel. */
export function RegisterStartStep(props: RegisterStartStepProps) {
  const { methods, entry, errors, notice, busy, termsHtml, onEntry } = props
  const lock = useSubmitWait(props.wait)
  const ways = methods.map((method) => METHOD_NAME[method]).join(' یا ')
  return (
    <AuthCard
      title="ثبت‌نام"
      description={`با ${ways} خود حساب کاربری بسازید.`}
      titleRef={props.titleRef}
    >
      {notice}
      <AuthForm
        className="gap-5"
        onSubmit={() => {
          if (!busy && !lock.locked) props.onSubmit()
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="نام" error={errors.firstName}>
            <Input
              data-autofocus=""
              name="given-name"
              autoComplete="given-name"
              enterKeyHint="next"
              value={entry.firstName}
              onChange={(event) => onEntry({ firstName: event.currentTarget.value }, 'firstName')}
            />
          </Field>
          <Field label="نام خانوادگی" error={errors.lastName}>
            <Input
              name="family-name"
              autoComplete="family-name"
              enterKeyHint="next"
              value={entry.lastName}
              onChange={(event) => onEntry({ lastName: event.currentTarget.value }, 'lastName')}
            />
          </Field>
        </div>
        {methods.length > 1 ? (
          <Tabs
            value={entry.method}
            onValueChange={(value) => onEntry({ method: value as ContactType }, 'identifier', true)}
          >
            <TabsList variant="pill" aria-label="ثبت‌نام با" className="w-full">
              {methods.map((method) => (
                <TabsTrigger key={method} value={method} className="flex-1">
                  {METHOD_NAME[method]}
                </TabsTrigger>
              ))}
            </TabsList>
            {methods.map((method) => (
              <TabsContent key={method} value={method} className="flex flex-col gap-5">
                <IdentifierInput {...props} method={method} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <IdentifierInput {...props} method={entry.method} />
        )}
        <div className="flex flex-col gap-3">
          <SubmitButton busy={busy} lock={lock}>
            دریافت کد تأیید
          </SubmitButton>
          {termsHtml && (
            <div
              className="rich-content text-sm leading-6 text-ink-600"
              dangerouslySetInnerHTML={{ __html: termsHtml }}
            />
          )}
        </div>
      </AuthForm>
      <p className="text-center text-base leading-7 text-ink-700">
        حساب کاربری دارید؟{' '}
        <Link href={props.loginHref} className={TEXT_LINK}>
          وارد شوید
        </Link>
      </p>
    </AuthCard>
  )
}
