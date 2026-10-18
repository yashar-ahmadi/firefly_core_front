'use client'

import { useReducer, useRef } from 'react'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import type { OrderTrackingResult } from '@/lib/api/types/order-detail'
import { trackOrder } from './track-api'
import { checkTrack, type TrackErrors, type TrackField, type TrackInput } from './track-input'
import { NOT_FOUND, THROTTLED, trackRefusal } from './track-refusal'

// The tracking lookup (order digest §3.1.8): checked here first (track-input.ts), then ONE
// `POST order/track/` per press however fast the presses come (a ref guard from the press to the
// answer; never a call per keystroke: 20/min per IP), none while a 429's wait runs. A new lookup
// clears the result of the one before (a pair that is not found must not look like the last
// one's order). What the shopper typed stays with the form; nothing of it is kept anywhere else.

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
}

export function useTrackOrder(): TrackOrder {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const sending = useRef(false)

  async function track(input: TrackInput, locked: boolean) {
    if (sending.current || locked) return
    const checked = checkTrack(input)
    if (!checked.ok) return dispatch({ type: 'invalid', errors: checked.errors })
    sending.current = true
    dispatch({ type: 'send' })
    try {
      dispatch({ type: 'found', result: await trackOrder(checked.body) })
    } catch (error) {
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
      sending.current = false
    }
  }

  return {
    ...state,
    track: (input, locked) => void track(input, locked),
    edit: (field) => dispatch({ type: 'edit', field }),
  }
}
