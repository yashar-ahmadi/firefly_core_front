// The waits of the forms (the auth steps, the account forms), always the API's seconds
// (`resend_after`, `expires_in`, a 429's `retry_after`) turned into absolute deadlines at the
// moment the answer came. Pure: the reducers store them and the timers (`components/form/
// code-timers.tsx`) count down to them.

/**
 * A wait that ends at `until` (epoch ms; 0: no wait). An absolute time, so a timer shown again
 * later (back on the step, another phase) shows what is left; `seq` tells each new wait apart.
 */
export interface Wait {
  until: number
  seq: number
}

/** A wait that blocks one step's main action (a 429 on it). */
export interface StepWait<S extends string> extends Wait {
  step: S
}

/** No wait yet. */
export const NO_WAIT: Wait = { until: 0, seq: 0 }

/** For a step no wait is for: a `seq` no stored wait has, so its timer starts afresh. */
const NOT_WAITING: Wait = { until: 0, seq: -1 }

/** A new wait of `seconds` from `now`; 0 seconds ends the previous one. */
export function restartWait(previous: Wait, now: number, seconds: number): Wait {
  return { until: seconds > 0 ? now + seconds * 1000 : 0, seq: previous.seq + 1 }
}

interface Waits<S extends string> {
  /** The request that failed asked for a code. */
  sending: boolean
  sendWait: Wait
  submitWait: StepWait<S>
}

/**
 * Where a failure's `retry_after` goes: before the next code when the request was a send, or
 * when the answer is about codes (a send refused, a code spent); otherwise before the main action
 * of `step`, the step the failure lands on. Without a `retry_after`, the waits stay as they were.
 */
export function failureWaits<S extends string>(
  { sending, sendWait, submitWait }: Waits<S>,
  failure: { retryAfter?: number | null; sendSide?: boolean },
  step: S,
  now: number,
): Pick<Waits<S>, 'sendWait' | 'submitWait'> {
  const { retryAfter, sendSide } = failure
  if (!retryAfter || retryAfter <= 0) return { sendWait, submitWait }
  if (sending || sendSide) return { sendWait: restartWait(sendWait, now, retryAfter), submitWait }
  return { sendWait, submitWait: { ...restartWait(submitWait, now, retryAfter), step } }
}

/** The 429 wait of the step on screen, if the last one was for it. */
export function stepWait<S extends string>(state: { submitWait: StepWait<S>; step: S }): Wait {
  return state.submitWait.step === state.step ? state.submitWait : NOT_WAITING
}

/** That wait still runs: the step's main action is not sent. */
export function stepWaiting<S extends string>(state: {
  submitWait: StepWait<S>
  step: S
}): boolean {
  return stepWait(state).until > Date.now()
}
