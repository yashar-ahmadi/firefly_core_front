'use client'

import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/api/errors'
import type { PaymentStatus } from '@/lib/api/types/payment'
import { readAttemptStatus } from './attempt-api'

// The status of an attempt whose bank has answered and whose verification runs (order digest
// §5.9 row 3, §5.11): read at once, then 15 s apart four times and 30 s apart four times (about
// three minutes), paused while the page is hidden, a 429's `retry_after` honoured. Then it stops
// and says so (`exhausted`). Deliberately minimal and bounded: Task 5's `usePaymentStatus` (the
// full policy: 60 s on, 15 minutes, the anonymous retry after a 403) replaces it.

export const ATTEMPT_POLL_DELAYS_MS = [15, 15, 15, 15, 30, 30, 30, 30].map((s) => s * 1000)

export interface AttemptStatus {
  /** The last status read (null: none yet). */
  status: PaymentStatus | null
  /** The reads are over and it is still pending. */
  exhausted: boolean
  /** It cannot be read here (403, 404): the order says the rest. */
  unreadable: boolean
}

const IDLE: AttemptStatus = { status: null, exhausted: false, unreadable: false }

export function useAttemptStatus(uuid: string, enabled: boolean): AttemptStatus {
  const [state, setState] = useState(IDLE)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let step = 0
    let parked = false
    const later = (ms: number) => {
      timer = setTimeout(() => void read(), ms)
    }
    const next = () => {
      const delay = ATTEMPT_POLL_DELAYS_MS[step++]
      if (delay === undefined) setState((current) => ({ ...current, exhausted: true }))
      else later(delay)
    }
    async function read(): Promise<void> {
      if (controller.signal.aborted) return
      // Hidden: wait for the page to show again (`onVisible`).
      if (document.hidden) {
        parked = true
        return
      }
      try {
        const info = await readAttemptStatus(uuid, controller.signal)
        setState((current) => ({ ...current, status: info.status }))
        if (info.status !== 'pending') return
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 429 && error.retryAfter) {
          return later(error.retryAfter * 1000)
        }
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          return setState((current) => ({ ...current, unreadable: true }))
        }
      }
      next()
    }
    const onVisible = () => {
      if (document.hidden || !parked) return
      parked = false
      void read()
    }
    document.addEventListener('visibilitychange', onVisible)
    void read()
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [uuid, enabled])

  return enabled ? state : IDLE
}
