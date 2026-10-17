'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useReducer, useRef, useState } from 'react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { announce } from '@/components/ui/live-announcer'
import { authApi } from '@/features/auth/api'
import { FormAlert } from '@/features/auth/components/auth-card'
import { AuthForm } from '@/features/auth/components/auth-form'
import { useSubmitWait } from '@/features/auth/components/code-timers'
import { SubmitButton } from '@/features/auth/components/login-fields'
import { useRequestRunner } from '@/features/auth/components/use-request-runner'
import type { ProfileChanges, UserProfile } from '@/lib/api/types/account'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { formFailure, formReducer, initialFormState } from './form-state'
import { FORM_BUTTON, ProfileSection, SavedNote, useFormFocus } from './profile-section'

type NameField = 'firstName' | 'lastName'
type Names = Record<NameField, string>

/** The API takes 1–200 characters for each (auth digest §4.16). */
const MAX_LENGTH = 200
const SAVED = 'نام شما ذخیره شد.'

const MESSAGES: Record<NameField, { required: string; tooLong: string }> = {
  firstName: { required: 'نام را وارد کنید.', tooLong: 'نام حداکثر ۲۰۰ نویسه است.' },
  lastName: {
    required: 'نام خانوادگی را وارد کنید.',
    tooLong: 'نام خانوادگی حداکثر ۲۰۰ نویسه است.',
  },
}

const toFailure = (error: unknown) =>
  formFailure<NameField>(error, {
    byCode: {},
    byAttr: { first_name: 'firstName', last_name: 'lastName' },
  })

/** What differs from the profile, trimmed: the PATCH sends only that. */
function changesOf(names: Names, me: UserProfile): ProfileChanges {
  const changes: ProfileChanges = {}
  const first = names.firstName.trim()
  const last = names.lastName.trim()
  if (first !== me.first_name) changes.first_name = first
  if (last !== me.last_name) changes.last_name = last
  return changes
}

function namesErrors(names: Names): Partial<Record<NameField, string>> {
  const errors: Partial<Record<NameField, string>> = {}
  for (const field of ['firstName', 'lastName'] as const) {
    const value = names[field].trim()
    if (value === '') errors[field] = MESSAGES[field].required
    else if (value.length > MAX_LENGTH) errors[field] = MESSAGES[field].tooLong
  }
  return errors
}

function NamesForm({ me }: { me: UserProfile }) {
  const client = useQueryClient()
  const [state, dispatch] = useReducer(formReducer<NameField>, undefined, initialFormState)
  const run = useRequestRunner(dispatch, toFailure)
  const lock = useSubmitWait(state.submitWait)
  const container = useRef<HTMLDivElement>(null)
  useFormFocus(container, state.attempt)
  // What was typed; null while the fields show the profile as it is (after a save, too).
  const [draft, setDraft] = useState<Names | null>(null)
  const names = draft ?? { firstName: me.first_name, lastName: me.last_name }
  const changes = changesOf(names, me)
  const changed = Object.keys(changes).length > 0
  const errors = state.fieldErrors

  function edit(field: NameField, value: string) {
    setDraft({ ...names, [field]: value })
    dispatch({ type: 'edit', field })
  }

  function save() {
    if (!changed || state.busy || lock.locked) return
    const invalid = namesErrors(names)
    if (Object.keys(invalid).length > 0) return dispatch({ type: 'invalid', errors: invalid })
    run(
      () => authApi.updateMe(changes),
      (profile) => {
        // The answer is the whole profile: every place that shows the name follows.
        client.setQueryData(ME_KEY, profile)
        setDraft(null)
        dispatch({ type: 'saved', message: SAVED })
        announce(SAVED)
      },
    )
  }

  return (
    <div ref={container}>
      <AuthForm className="gap-5" onSubmit={save}>
        {state.notice && <FormAlert>{state.notice.detail}</FormAlert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="نام" error={errors.firstName}>
            <Input
              name="given-name"
              autoComplete="given-name"
              enterKeyHint="next"
              value={names.firstName}
              onChange={(event) => edit('firstName', event.currentTarget.value)}
            />
          </Field>
          <Field label="نام خانوادگی" error={errors.lastName}>
            <Input
              name="family-name"
              autoComplete="family-name"
              enterKeyHint="done"
              value={names.lastName}
              onChange={(event) => edit('lastName', event.currentTarget.value)}
            />
          </Field>
        </div>
        <SavedNote message={state.saved} />
        <SubmitButton
          busy={state.busy}
          lock={lock}
          size="md"
          className={FORM_BUTTON}
          // Focusable while there is nothing to save, so the focus stays on it after a save.
          aria-disabled={!changed || state.busy || lock.locked || undefined}
        >
          ذخیرهٔ نام
        </SubmitButton>
      </AuthForm>
    </div>
  )
}

/** The first and last name (auth digest §4.16, F11), saved with a PATCH of what changed. */
export function ProfileForm({ me }: { me: UserProfile | undefined }) {
  return (
    <ProfileSection title="نام و نام خانوادگی" loading={!me}>
      {me && <NamesForm me={me} />}
    </ProfileSection>
  )
}
