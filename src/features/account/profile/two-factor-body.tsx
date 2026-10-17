'use client'

import { useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { Spinner } from '@/components/ui/spinner'
import { authApi } from '@/features/auth/api'
import { FormAlert } from '@/components/form/form-alert'
import { CODE_INCOMPLETE } from '@/features/auth/components/auth-messages'
import type { TotpSetup } from '@/lib/api/types/account'
import { useFormFocus } from '@/components/form/use-form-focus'
import { formFailure, formReducer, initialFormState, type FormAction } from './form-state'
import { PartLoading, PartUnavailable } from './lazy-part'
import { SavedNote } from './profile-section'
import type { TotpCodeFormProps, TotpSetupViewProps } from './totp-setup'
import { useProfileRunner } from './use-profile-runner'
import { setTotpEnabled, TOTP_STATUS_KEY } from './use-totp-status'

// The setup (QR code, key, code boxes) and the disable form load on the first press, or as the
// pointer or the focus reaches the button. A failed download says so in place.
const loadForms = () => import('./totp-setup')
const TotpSetupView = dynamic<TotpSetupViewProps>(
  () =>
    loadForms()
      .then((module) => module.TotpSetupView)
      .catch(() => PartUnavailable),
  { ssr: false, loading: PartLoading },
)
const TotpCodeForm = dynamic<TotpCodeFormProps>(
  () =>
    loadForms()
      .then((module) => module.TotpCodeForm)
      .catch(() => PartUnavailable),
  { ssr: false, loading: PartLoading },
)
/** A failed preload is dropped: the press tries again. */
const preloadForms = () => {
  loadForms().catch(() => {})
}

type Mode = 'idle' | 'setup' | 'disable'

const ENABLED = 'ورود دومرحله‌ای فعال شد.'
const DISABLED = 'ورود دومرحله‌ای غیرفعال شد.'

const toFailure = (error: unknown) =>
  formFailure<'code'>(error, {
    byCode: { auth_totp_invalid: 'code', auth_totp_locked: 'code' },
    byAttr: { totp_code: 'code' },
  })

/** The status the form acted on was not the account's (on already, or off already). */
const STALE_STATUS = new Set(['auth_already_verified', 'auth_not_verified'])

/**
 * Two-step login's controls under its status (auth digest §4.19, F10): «فعال‌سازی ورود دومرحله‌ای»
 * → setup (QR code, key, a code enables), or «غیرفعال‌سازی» → a code disables. Wrong codes are
 * emptied; `auth_totp_locked` holds the button for `retry_after`.
 */
export function TwoFactorBody({ enabled }: { enabled: boolean }) {
  const client = useQueryClient()
  const [mode, setMode] = useState<Mode>('idle')
  // The setup's secret lives here only, while the setup is on screen: never in a cache.
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [code, setCode] = useState('')
  const [state, apply] = useReducer(formReducer<'code'>, undefined, initialFormState)
  const start = useRef<HTMLButtonElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)

  const close = useCallback(() => {
    setSetup(null)
    setCode('')
    setMode('idle')
    refocus.current = true
  }, [])

  const dispatch = useCallback(
    (action: FormAction<'code'>) => {
      if (action.type === 'failed') {
        const { fields, code: failed } = action.failure
        // A wrong code is typed again from scratch (kept, each new digit would resend it).
        if (fields.code !== undefined) setCode('')
        if (STALE_STATUS.has(failed)) {
          close()
          void client.invalidateQueries({ queryKey: TOTP_STATUS_KEY })
        }
      }
      apply(action)
    },
    [client, close],
  )
  const run = useProfileRunner(dispatch, toFailure)

  // A form that closes takes its focus along: it goes back to the button that opened it.
  useEffect(() => {
    if (mode !== 'idle' || !refocus.current) return
    refocus.current = false
    start.current?.focus()
  })
  useFormFocus(container, state.attempt)

  function finish(on: boolean) {
    setTotpEnabled(client, on)
    close()
    const message = on ? ENABLED : DISABLED
    dispatch({ type: 'saved', message })
    announce(message)
  }

  function send(value: string, request: () => Promise<unknown>, on: boolean) {
    if (value.length !== 6) return dispatch({ type: 'invalid', errors: { code: CODE_INCOMPLETE } })
    run(request, () => finish(on))
  }

  const notice = state.notice && <FormAlert>{state.notice.detail}</FormAlert>
  const form = {
    code,
    error: state.fieldErrors.code,
    busy: state.busy,
    submitWait: state.submitWait,
    onCode: (value: string) => {
      setCode(value)
      dispatch({ type: 'edit', field: 'code' })
    },
    onCancel: close,
  }

  return (
    <div ref={container} className="flex flex-col gap-4">
      <p className="text-base leading-7 text-ink-700">
        {enabled ? (
          'هنگام ورود، پس از رمز عبور یا کد یکبار مصرف، کد ۶ رقمی برنامهٔ احراز هویت گوشی‌تان هم خواسته می‌شود.'
        ) : (
          <>
            با روشن کردن آن، هنگام ورود علاوه بر رمز عبور یا کد یکبار مصرف، کد ۶ رقمی برنامهٔ احراز
            هویت گوشی‌تان (مانند{' '}
            <bdi dir="ltr" className="whitespace-nowrap">
              Google Authenticator
            </bdi>
            ) هم خواسته می‌شود.
          </>
        )}
      </p>
      {mode === 'idle' && notice}
      <SavedNote message={state.saved} />
      {mode === 'idle' && (
        <Button
          ref={start}
          variant={enabled ? 'outline' : 'primary'}
          className="sm:self-start"
          aria-busy={state.busy || undefined}
          iconStart={state.busy ? <Spinner /> : enabled ? undefined : <ShieldCheck aria-hidden />}
          onPointerEnter={preloadForms}
          onFocus={preloadForms}
          onClick={() => {
            if (state.busy) return
            if (enabled) return setMode('disable')
            run(
              () => authApi.totpSetup(),
              (data) => {
                dispatch({ type: 'settled' })
                setSetup(data)
                setMode('setup')
              },
            )
          }}
        >
          {enabled ? 'غیرفعال‌سازی' : 'فعال‌سازی ورود دومرحله‌ای'}
        </Button>
      )}
      {mode === 'setup' && setup && (
        <TotpSetupView
          {...form}
          setup={setup}
          notice={notice}
          onSubmit={(value = code) =>
            send(value, () => authApi.totpEnable({ totp_code: value }), true)
          }
        />
      )}
      {mode === 'disable' && (
        <div className="flex flex-col gap-4 rounded-control border border-ink-200 p-4 sm:p-5">
          <p className="text-base leading-7 text-ink-800">
            برای غیرفعال‌سازی، کد ۶ رقمی کنونی برنامهٔ احراز هویت را وارد کنید. پس از آن، رمز عبور
            یا کد یکبار مصرف به‌تنهایی برای ورود کافی است.
          </p>
          {notice}
          <TotpCodeForm
            {...form}
            autoFocus
            submit="غیرفعال‌سازی"
            variant="danger"
            onSubmit={(value = code) =>
              send(value, () => authApi.totpDisable({ totp_code: value }), false)
            }
          />
        </div>
      )}
    </div>
  )
}
