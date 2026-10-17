import { describe, expect, it } from 'vitest'
import { codeFlowReducer, initialCodeFlowState } from '@/features/auth/components/code-flow-state'
import type {
  CodeFlowAction,
  CodeFlowFailure,
  CodeFlowState,
} from '@/features/auth/components/code-flow-types'

// The registration and recovery state machine: entry → code → password → done. Pure.

interface Entry {
  name: string
  identifier: string
}

type State = CodeFlowState<Entry>
const NOW = 1_000_000
const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const

function run(state: State, ...actions: CodeFlowAction<Entry>[]): State {
  return actions.reduce<State>(codeFlowReducer, state)
}

const failed = (failure: CodeFlowFailure): CodeFlowAction<Entry> => ({
  type: 'failed',
  failure,
  now: NOW,
})

/** On the code step with a code sent and a token held. */
function sentState(): State {
  return run(
    initialCodeFlowState<Entry>({ name: 'نیما', identifier: 'a@example.com' }),
    { type: 'submit', sending: true },
    { type: 'codeSent', sent: SENT, now: NOW, token: 't1', sentKey: 'k1' },
  )
}

describe('codeFlowReducer', () => {
  it('a code sent moves to the code step with deadlines from the API seconds', () => {
    const state = sentState()
    expect(state).toMatchObject({ step: 'code', token: 't1', sentKey: 'k1', busy: false })
    expect(state.codeExpiry.until).toBe(NOW + 300_000)
    expect(state.sendWait.until).toBe(NOW + 120_000)
  })

  it('a new identifier forgets the code, the token and the send wait; a name change does not', () => {
    const named = run(
      sentState(),
      { type: 'go', step: 'entry' },
      { type: 'entry', changes: { name: 'نیما ر' }, field: 'firstName' },
    )
    expect(named).toMatchObject({ token: 't1', otpSent: SENT, sentKey: 'k1' })
    expect(named.entry.name).toBe('نیما ر')

    const moved = run(named, {
      type: 'entry',
      changes: { identifier: 'b@example.com' },
      field: 'identifier',
      destination: true,
    })
    expect(moved).toMatchObject({ token: null, otpSent: null, sentKey: null, otpCode: '' })
    expect(moved.sendWait.until).toBe(0)
  })

  it('a void token starts over at the entry, keeping what was typed and the send wait', () => {
    const state = run(
      sentState(),
      { type: 'verified' },
      { type: 'edit', field: 'password', value: 'x' },
    )
    const restarted = run(
      state,
      {
        type: 'submit',
      },
      failed({ detail: 'منقضی شد.', code: 'auth_token_expired', restart: true }),
    )
    expect(restarted).toMatchObject({
      step: 'entry',
      token: null,
      sentKey: null,
      otpSent: null,
      notice: { detail: 'منقضی شد.', code: 'auth_token_expired' },
    })
    expect(restarted.entry.identifier).toBe('a@example.com')
    expect(restarted.sendWait.until).toBe(NOW + 120_000)
  })

  it('keeps the reasons of a weak password until the password changes', () => {
    const state = run(
      sentState(),
      { type: 'verified', token: 'reset-1' },
      { type: 'submit' },
      failed({
        field: 'password',
        detail: 'الف ب',
        code: 'auth_password_weak',
        reasons: ['الف', 'ب'],
      }),
    )
    expect(state).toMatchObject({ step: 'password', token: 'reset-1', reasons: ['الف', 'ب'] })
    expect(state.fieldErrors).toEqual({ password: 'الف ب' })
    const edited = run(state, { type: 'edit', field: 'password', value: 'y' })
    expect(edited.fieldErrors).toEqual({})
    expect(edited.reasons).toEqual([])
  })

  it('a 429 on a send holds the next send; on a check, that step’s main action', () => {
    const throttled = { detail: 'صبر کنید.', code: 'throttled', retryAfter: 30 }
    const send = run(sentState(), { type: 'submit', sending: true }, failed(throttled))
    expect(send.sendWait.until).toBe(NOW + 30_000)
    expect(send.submitWait.until).toBe(0)

    const check = run(sentState(), { type: 'submit' }, failed(throttled))
    expect(check.submitWait).toMatchObject({ until: NOW + 30_000, step: 'code' })
    // A spent code (too many tries) waits for the next send and is typed again from scratch.
    const spent = run(
      sentState(),
      { type: 'edit', field: 'otpCode', value: '123456' },
      { type: 'submit' },
      failed({
        ...throttled,
        code: 'auth_otp_too_many_attempts',
        sendSide: true,
        forgetCode: true,
      }),
    )
    expect(spent).toMatchObject({ otpSent: null, otpCode: '', step: 'code' })
    expect(spent.sendWait.until).toBe(NOW + 30_000)
  })

  it('a failure may name the step it belongs to (a code not checked yet: back to it)', () => {
    const state = run(
      sentState(),
      { type: 'verified' },
      { type: 'submit' },
      failed({ detail: 'ابتدا کد را تأیید کنید.', code: 'auth_not_verified', step: 'code' }),
    )
    expect(state.step).toBe('code')
    expect(state.notice?.code).toBe('auth_not_verified')
  })
})
