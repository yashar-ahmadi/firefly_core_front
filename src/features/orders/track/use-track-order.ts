'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import type { OrderTrackingResult } from '@/lib/api/types/order-detail'
import { trackOrder } from './track-api'
import { checkTrack, type TrackErrors, type TrackField, type TrackInput } from './track-input'
import { NOT_FOUND, THROTTLED, trackRefusal } from './track-refusal'

// The tracking lookup (order digest §3.1.8): checked here first (track-input.ts), then ONE
// `POST order/track/` per press however fast the presses come (a ref guard from the press to the
// answer; never a call per keystroke: 20/min per IP), none while a 429's wait runs. A new lookup
// clears the result of the one before (a pair that is not found must not look like the last
// one's order), and so does a recent order tapped (`clear`: its code goes into the form; a lookup
// on its way is aborted). A lookup still on its way when the page goes is aborted. What the shopper typed stays with the form;
// nothing of it is kept anywhere else.

export interface TrackAlert {
  kind: 'not_found' | 'throttled' | 'other'
  message: string
}

export interface TrackState {
  busy: boolean
  errors: TrackErrors
  alert: TrackAlert | null
  result: OrderTrackingResult | null
  /** Grows on every refusal with field messages: the first field in error takes the focus. */
  attempt: number
  /** Grows with each result shown: the new one takes the focus. */
  shown: number
  wait: Wait
}

type Action =
  | { type: 'invalid'; errors: TrackErrors }
  | { type: 'send' }
  | { type: 'found'; result: OrderTrackingResult }
  | { type: 'refused'; errors?: TrackErrors; alert?: TrackAlert; retryAfter?: number }
  | { type: 'edit'; field: TrackField }
  | { type: 'clear' }

const INITIAL: TrackState = {
  busy: false,
  errors: {},
  alert: null,
  result: null,
  attempt: 0,
  shown: 0,
  wait: NO_WAIT,
}

function reducer(state: TrackState, action: Action): TrackState {
  switch (action.type) {
    case 'invalid':
      return { ...state, errors: action.errors, alert: null, attempt: state.attempt + 1 }
    case 'send':
      return { ...state, busy: true, errors: {}, alert: null, result: null }
    case 'found':
      return { ...state, busy: false, result: action.result, shown: state.shown + 1 }
    case 'refused': {
      const errors = action.errors ?? {}
      return {
        ...state,
        busy: false,
        errors,
        alert: action.alert ?? null,
        attempt: Object.keys(errors).length > 0 ? state.attempt + 1 : state.attempt,
        wait: action.retryAfter
          ? restartWait(state.wait, Date.now(), action.retryAfter)
          : state.wait,
      }
    }
    case 'clear':
      return { ...state, busy: false, alert: null, result: null }
    case 'edit': {
      if (state.errors[action.field] === undefined) return state
      const errors = { ...state.errors }
      delete errors[action.field]
      return { ...state, errors }
    }
  }
}

export interface TrackOrder extends TrackState {
  /** One lookup (nothing while one is on its way, or `locked`: a 429's wait). */
  track: (input: TrackInput, locked: boolean) => void
  /** A field was edited: its message goes. */
  edit: (field: TrackField) => void
  /** Another order is about to be looked up (a recent one tapped): what was found before goes. */
  clear: () => void
}

export function useTrackOrder(): TrackOrder {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const sending = useRef(false)
  const lookup = useRef<AbortController | null>(null)
  useEffect(() => () => lookup.current?.abort(), [])
  // Stable: the page's recent-orders handler depends on it. A lookup still on its way is of the
  // order before: aborted too, so its answer never shows under the new code.
  const clear = useCallback(() => {
    lookup.current?.abort()
    lookup.current = null
    sending.current = false
    dispatch({ type: 'clear' })
  }, [])

  async function track(input: TrackInput, locked: boolean) {
    if (sending.current || locked) return
    const checked = checkTrack(input)
    if (!checked.ok) return dispatch({ type: 'invalid', errors: checked.errors })
    sending.current = true
    const controller = new AbortController()
    lookup.current = controller
    dispatch({ type: 'send' })
    try {
      const result = await trackOrder(checked.body, controller.signal)
      if (!controller.signal.aborted) dispatch({ type: 'found', result })
    } catch (error) {
      if (controller.signal.aborted) return
      const refusal = trackRefusal(error)
      if (refusal.kind === 'fields') dispatch({ type: 'refused', errors: refusal.errors })
      else if (refusal.kind === 'not_found') {
        dispatch({ type: 'refused', alert: { kind: 'not_found', message: NOT_FOUND } })
      } else if (refusal.kind === 'throttled') {
        dispatch({
          type: 'refused',
          alert: { kind: 'throttled', message: THROTTLED },
          retryAfter: refusal.retryAfter,
        })
      } else dispatch({ type: 'refused', alert: { kind: 'other', message: refusal.message } })
    } finally {
      // Not when this lookup was dropped (`clear`): another may be on its way by then.
      if (lookup.current === controller) sending.current = false
    }
  }

  return {
    ...state,
    track: (input, locked) => void track(input, locked),
    edit: (field) => dispatch({ type: 'edit', field }),
    clear,
  }
}
