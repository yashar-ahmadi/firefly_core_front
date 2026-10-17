'use client'

import { useCallback, useRef, type Dispatch } from 'react'

// One auth request at a time, its answer handed to the step's reducer: the same for login,
// registration and password recovery.

/** What a runner dispatches: `submit` as it sends, `failed` (with the moment) when refused. */
export type RunnerAction<F> =
  { type: 'submit'; sending?: boolean } | { type: 'failed'; failure: F; now: number }

/**
 * Handles an answer. `'leaving'` keeps the form locked for good: the page is changing (signed
 * in, or on to another page).
 */
export type Settle<T> = (value: T) => void | 'leaving' | Promise<void | 'leaving'>

/** Sends `request`; `settle` gets its answer. `sending`: it asks for a code (see `failureWaits`). */
export type Run = <T>(request: () => Promise<T>, settle: Settle<T>, sending?: boolean) => void

/**
 * `run(request, settle, sending)`: dispatches `submit`, sends the request and hands the answer to
 * `settle`, or dispatches `failed` with `toFailure(error)` and the moment it answered (the
 * reducer turns the API's seconds into deadlines with it). A second `run` while one is on its
 * way does nothing: the lock is set at once, while the state's `busy` comes only with a render,
 * so a double press sends one request.
 */
export function useRequestRunner<F>(
  dispatch: Dispatch<RunnerAction<F>>,
  toFailure: (error: unknown) => F,
): Run {
  const inFlight = useRef(false)
  return useCallback(
    <T>(request: () => Promise<T>, settle: Settle<T>, sending = false) => {
      if (inFlight.current) return
      inFlight.current = true
      dispatch({ type: 'submit', sending })
      void (async () => {
        let value: T
        try {
          value = await request()
        } catch (error) {
          inFlight.current = false
          dispatch({ type: 'failed', failure: toFailure(error), now: Date.now() })
          return
        }
        const outcome = settle(value)
        const settled = outcome instanceof Promise ? await outcome : outcome
        if (settled !== 'leaving') inFlight.current = false
      })()
    },
    [dispatch, toFailure],
  )
}
