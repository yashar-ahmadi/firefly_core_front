import { describe, expect, it } from 'vitest'
import {
  initialLoginState,
  loginReducer,
  type LoginAction,
  type LoginState,
} from '@/features/auth/components/login-state'

// The login state machine: identifier → (password | otp) → totp? → done. Pure.

const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const
/** The moment of every action here (epoch ms). */
const NOW = 1_000_000
const PASSWORD_BODY = {
  login_method: 'email',
  login_identifier: 'sara.ahmadi@example.com',
  password: 'Firefly@1234',
  remember_me: true,
} as const

function run(...actions: LoginAction[]): LoginState {
  return actions.reduce(loginReducer, initialLoginState('sara.ahmadi@example.com'))
}

describe('loginReducer', () => {
  it('starts on the identifier step with the prefilled identifier', () => {
    expect(initialLoginState('a@b.co')).toMatchObject({
      step: 'identifier',
      identifier: 'a@b.co',
      password: '',
      busy: false,
    })
  })

  it('moves to the second step on a TOTP challenge, keeping what was typed, and back', () => {
    const challenged = run(
      { type: 'go', step: 'password' },
      { type: 'edit', field: 'password', value: 'Firefly@1234' },
      { type: 'remember', value: true },
      { type: 'submit' },
      { type: 'needsTotp', request: { kind: 'password', body: PASSWORD_BODY } },
    )
    expect(challenged).toMatchObject({
      step: 'totp',
      totpFrom: 'password',
      pending: { kind: 'password', body: PASSWORD_BODY },
      busy: false,
      password: 'Firefly@1234',
      rememberMe: true,
    })
    const back = loginReducer(challenged, { type: 'back' })
    expect(back).toMatchObject({ step: 'password', password: 'Firefly@1234', pending: null })
    expect(loginReducer(back, { type: 'back' })).toMatchObject({
      step: 'identifier',
      identifier: 'sara.ahmadi@example.com',
      password: 'Firefly@1234',
    })
  })

  it('shows a failure under its field, on the step of that field', () => {
    const state = run(
      { type: 'go', step: 'password' },
      { type: 'submit' },
      {
        type: 'failed',
        failure: { field: 'identifier', detail: 'فرمت ایمیل نامعتبر است.', code: 'x' },
        now: NOW,
      },
    )
    expect(state).toMatchObject({
      step: 'identifier',
      busy: false,
      fieldErrors: { identifier: 'فرمت ایمیل نامعتبر است.' },
      notice: null,
    })
    // Typing again clears that field's message.
    const edited = loginReducer(state, { type: 'edit', field: 'identifier', value: 'sara@x.co' })
    expect(edited.fieldErrors.identifier).toBeUndefined()
  })

  it('keeps a second-step failure on that step, and sends a dead first step back to it', () => {
    const totp = run(
      { type: 'go', step: 'otp' },
      { type: 'needsTotp', request: { kind: 'google', body: { id_token: 't' } } },
    )
    const invalid = loginReducer(totp, {
      type: 'failed',
      failure: { field: 'totp', detail: 'کد نامعتبر است.', code: 'auth_totp_invalid' },
      now: NOW,
    })
    expect(invalid).toMatchObject({ step: 'totp', fieldErrors: { totp: 'کد نامعتبر است.' } })
    const dead = loginReducer(totp, {
      type: 'failed',
      failure: {
        detail: 'توکن گوگل نامعتبر است.',
        code: 'auth_google_token_invalid',
        restart: true,
      },
      now: NOW,
    })
    expect(dead).toMatchObject({
      step: 'otp',
      pending: null,
      notice: { detail: 'توکن گوگل نامعتبر است.', code: 'auth_google_token_invalid' },
    })
  })

  it('counts each code sent, with its expiry and resend wait as moments from the API seconds', () => {
    const once = run({ type: 'go', step: 'otp' }, { type: 'otpSent', sent: SENT, now: NOW })
    expect(once).toMatchObject({
      otpSent: SENT,
      sends: 1,
      codeExpiry: { until: NOW + 300_000 },
      sendWait: { until: NOW + 120_000 },
    })
    // The same seconds at the same moment: still a new wait, so its timer starts over.
    const twice = loginReducer(once, { type: 'otpSent', sent: SENT, now: NOW })
    expect(twice.sends).toBe(2)
    expect(twice.sendWait.until).toBe(once.sendWait.until)
    expect(twice.sendWait.seq).not.toBe(once.sendWait.seq)
    const throttled = loginReducer(twice, {
      type: 'failed',
      failure: { detail: 'صبر کنید.', code: 'auth_otp_throttled', retryAfter: 30, sendSide: true },
      now: NOW + 5000,
    })
    expect(throttled.sendWait.until).toBe(NOW + 35_000)
    expect(throttled.sendWait.seq).not.toBe(twice.sendWait.seq)
    expect(throttled.otpSent).toEqual(SENT)
  })

  it('forgets a code the API no longer has (a failed resend voids the previous one)', () => {
    const state = run(
      { type: 'go', step: 'otp' },
      { type: 'otpSent', sent: SENT, now: NOW },
      { type: 'edit', field: 'otpCode', value: '123' },
      {
        type: 'failed',
        failure: { detail: 'خطا در ارسال کد.', code: 'auth_otp_send_failed', forgetCode: true },
        now: NOW,
      },
    )
    expect(state).toMatchObject({ step: 'otp', otpSent: null, otpCode: '' })
    expect(state.notice?.code).toBe('auth_otp_send_failed')
  })

  it('forgets the code sent when the identifier changes', () => {
    const state = run(
      { type: 'go', step: 'otp' },
      { type: 'otpSent', sent: SENT, now: NOW },
      { type: 'back' },
      { type: 'edit', field: 'identifier', value: 'other@example.com' },
    )
    expect(state).toMatchObject({ otpSent: null, otpCode: '', sendWait: { until: 0 } })
  })

  it('locks the second step for the wait a TOTP lock gives, and clears its code', () => {
    const state = run(
      { type: 'needsTotp', request: { kind: 'google', body: { id_token: 't' } } },
      { type: 'edit', field: 'totpCode', value: '111111' },
      {
        type: 'failed',
        failure: { field: 'totp', detail: 'قفل است.', code: 'auth_totp_locked', retryAfter: 240 },
        now: NOW,
      },
    )
    expect(state).toMatchObject({
      step: 'totp',
      totpCode: '',
      submitWait: { until: NOW + 240_000, step: 'totp' },
    })
  })

  it('clears a wrong one-time code, so retyping it sends it once, not on every digit', () => {
    const state = run(
      { type: 'go', step: 'otp' },
      { type: 'otpSent', sent: SENT, now: NOW },
      { type: 'edit', field: 'otpCode', value: '111111' },
      { type: 'submit' },
      {
        type: 'failed',
        failure: { field: 'otp', detail: 'کد تأیید نامعتبر است.', code: 'auth_otp_invalid' },
        now: NOW,
      },
    )
    expect(state).toMatchObject({ step: 'otp', otpCode: '', otpSent: SENT })
    expect(state.fieldErrors.otp).toBe('کد تأیید نامعتبر است.')
  })

  it("makes a 429 wait for the step's main action, or for the next code when sending failed", () => {
    const throttled = { detail: 'محدود شد.', code: 'throttled', retryAfter: 20 }
    const onPassword = run(
      { type: 'go', step: 'password' },
      { type: 'submit' },
      { type: 'failed', failure: throttled, now: NOW },
    )
    expect(onPassword.submitWait).toMatchObject({ until: NOW + 20_000, step: 'password' })
    expect(onPassword.sendWait.until).toBe(0)
    // The same 429 for a code being sent waits before the next send instead.
    const onSend = run(
      { type: 'go', step: 'otp' },
      { type: 'submit', sending: true },
      { type: 'failed', failure: throttled, now: NOW },
    )
    expect(onSend.sendWait.until).toBe(NOW + 20_000)
    expect(onSend.submitWait.until).toBe(0)
    // Too many wrong codes: the answer to a verify, but the wait is for a new code.
    const spent = run(
      { type: 'go', step: 'otp' },
      { type: 'otpSent', sent: SENT, now: NOW },
      { type: 'submit' },
      {
        type: 'failed',
        failure: {
          detail: 'زیاد بود.',
          code: 'auth_otp_too_many_attempts',
          retryAfter: 45,
          forgetCode: true,
          sendSide: true,
        },
        now: NOW + 1000,
      },
    )
    expect(spent.sendWait.until).toBe(NOW + 46_000)
    expect(spent.submitWait.until).toBe(0)
  })

  it('is done once signed in, stays busy until the page changes, and keeps no secret', () => {
    const state = run(
      { type: 'go', step: 'password' },
      { type: 'edit', field: 'password', value: 'Firefly@1234' },
      { type: 'needsTotp', request: { kind: 'google', body: { id_token: 'gis-token' } } },
      { type: 'edit', field: 'totpCode', value: '123456' },
      { type: 'submit' },
      { type: 'signedIn' },
    )
    expect(state).toMatchObject({
      step: 'done',
      busy: true,
      password: '',
      pending: null,
      otpCode: '',
      totpCode: '',
    })
  })
})
