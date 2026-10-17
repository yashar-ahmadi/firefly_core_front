'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useReducer, useRef, useState } from 'react'
import { Field } from '@/components/ui/field'
import { announce } from '@/components/ui/live-announcer'
import { notify, toastRegionReady } from '@/components/ui/toaster'
import { authApi } from '@/features/auth/api'
import { FormAlert } from '@/components/form/form-alert'
import { newPasswordErrors } from '@/features/auth/components/auth-messages'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { SubmitButton } from '@/components/form/submit-button'
import { PasswordFields } from '@/features/auth/components/password-fields'
import { PasswordInput } from '@/features/auth/components/password-input'
import type { PasswordChangeBody, UserProfile } from '@/lib/api/types/account'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { useFormFocus } from '@/components/form/use-form-focus'
import { usernameOf } from './contact-rules'
import { formFailure, formReducer, initialFormState } from './form-state'
import { FORM_BUTTON, ProfileSection } from './profile-section'
import { useProfileRunner } from './use-profile-runner'

type PasswordField = 'current' | 'password' | 'confirm'
type Values = Record<PasswordField, string>

const TITLE = 'رمز عبور'
const EMPTY: Values = { current: '', password: '', confirm: '' }

const toFailure = (error: unknown) =>
  formFailure<PasswordField>(error, {
    byCode: {
      // A wrong current password (the dashboard's code; the login's, in case).
      auth_password_invalid: 'current',
      auth_invalid_credentials: 'current',
      // The account has a password after all: its field shows from then on.
      auth_password_required: 'current',
      auth_password_weak: 'password',
      auth_password_unchanged: 'password',
    },
    byAttr: { current_password: 'current', password: 'password', confirm_password: 'confirm' },
  })

const COPY = {
  change: {
    description:
      'پس از تغییر رمز عبور، از همهٔ دستگاه‌های دیگر خارج می‌شوید؛ در این دستگاه وارد می‌مانید.',
    labels: { password: 'رمز عبور جدید', confirm: 'تکرار رمز عبور جدید' },
    submit: 'تغییر رمز عبور',
    done: 'رمز عبور تغییر کرد',
  },
  set: {
    description:
      'حساب شما رمز عبور ندارد (با حساب گوگل ساخته شده است). با تعیین رمز عبور، با ایمیل یا شماره موبایل و رمز عبور هم می‌توانید وارد شوید.',
    labels: { password: 'رمز عبور', confirm: 'تکرار رمز عبور' },
    submit: 'تعیین رمز عبور',
    done: 'رمز عبور تعیین شد',
  },
} as const

function PasswordForm({ me }: { me: UserProfile }) {
  const client = useQueryClient()
  const [state, dispatch] = useReducer(formReducer<PasswordField>, undefined, initialFormState)
  const run = useProfileRunner(dispatch, toFailure)
  const lock = useSubmitWait(state.submitWait)
  const container = useRef<HTMLDivElement>(null)
  useFormFocus(container, state.attempt)
  const [values, setValues] = useState<Values>(EMPTY)
  // The API asked for the current password the profile said there was none of.
  const [asked, setAsked] = useState(false)
  if (state.errorCode === 'auth_password_required' && !asked) setAsked(true)
  const withCurrent = me.has_usable_password || asked
  const copy = withCurrent ? COPY.change : COPY.set
  const errors = state.fieldErrors

  function edit(field: PasswordField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    dispatch({ type: 'edit', field })
  }

  function save() {
    if (state.busy || lock.locked) return
    const invalid: Partial<Record<PasswordField, string>> = {
      ...(withCurrent && values.current === '' && { current: 'رمز فعلی را وارد کنید.' }),
      ...newPasswordErrors(values.password, values.confirm),
    }
    if (Object.keys(invalid).length > 0) return dispatch({ type: 'invalid', errors: invalid })
    const body: PasswordChangeBody = {
      ...(withCurrent && { current_password: values.current }),
      password: values.password,
      confirm_password: values.confirm,
    }
    const { done } = copy
    run(
      // The BFF keeps the new token pair (other sessions are revoked; this one goes on).
      () => authApi.passwordChange(body),
      () => {
        setValues(EMPTY)
        setAsked(false)
        dispatch({ type: 'saved', message: done })
        notify.success(done)
        if (!toastRegionReady()) announce(done)
        if (!me.has_usable_password) {
          client.setQueryData<UserProfile | null>(ME_KEY, (profile) =>
            profile ? { ...profile, has_usable_password: true } : profile,
          )
        }
      },
    )
  }

  return (
    // The card's line says «change» or «set», which only the profile (or the API) tells: the card
    // is drawn here, once the profile is in.
    <ProfileSection title={TITLE} description={copy.description}>
      <div ref={container} className="flex flex-col gap-5">
        {state.notice && <FormAlert>{state.notice.detail}</FormAlert>}
        <AuthForm className="gap-5 sm:max-w-md" onSubmit={save}>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={usernameOf(me)}
            readOnly
            hidden
          />
          {withCurrent && (
            <Field label="رمز فعلی" error={errors.current}>
              <PasswordInput
                name="current-password"
                autoComplete="current-password"
                enterKeyHint="next"
                value={values.current}
                onChange={(event) => edit('current', event.currentTarget.value)}
              />
            </Field>
          )}
          <PasswordFields
            labels={copy.labels}
            password={values.password}
            confirm={values.confirm}
            errors={errors}
            reasons={state.reasons}
            related={[me.first_name, me.last_name, me.email ?? '', me.username]}
            onPassword={(value) => edit('password', value)}
            onConfirm={(value) => edit('confirm', value)}
          />
          <SubmitButton busy={state.busy} lock={lock} size="md" className={FORM_BUTTON}>
            {copy.submit}
          </SubmitButton>
        </AuthForm>
      </div>
    </ProfileSection>
  )
}

/**
 * The password (auth digest §4.15, F8): changed with the current one, or set without it when
 * the account has none (made through Google). The BFF stores the token pair the API answers, so
 * this device stays signed in; a toast says it went through and the fields empty.
 */
export function PasswordSection({ me }: { me: UserProfile | undefined }) {
  return me ? <PasswordForm me={me} /> : <ProfileSection title={TITLE} loading skeletonFields={3} />
}
