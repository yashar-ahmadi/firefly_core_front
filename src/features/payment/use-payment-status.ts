'use client'

import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api/errors'
import type { PaymentStatusInfo } from '@/lib/api/types/payment'
import { readPaymentStatus } from './status-api'

// A payment's status, read until it is final (Plan 4 Global Constraints; order digest §5.10–
// 5.11): the first read at once, then 15 s apart four times, 30 s apart four times and 60 s
// apart from there, within 15 minutes of the first (the 240/h `payment_status` budget is shared
// with the payment lists); then it stops (`stopped`), and «بررسی دوباره» reads once more
// (`check`), never a new schedule. One read in flight at a time. While the page is hidden the
// reads wait; shown again, one reads at once and the schedule goes on where it was (shown after
// the 15 minutes, it stops without reading). A 429 waits its `retry_after`; no answer, the
// schedule goes on. With the session first: a signed-in visitor refused another account's
// payment (403 `payment_forbidden`, a guest order paid through its link) reads it again, and from
// then on, without the session (`?anon=1`, §11 #7); the payment is then `foreign`. The uuid is a
// credential: in the path only, never in a log.

/** The waits after each read: 15 s ×4, 30 s ×4, then 60 s. */
export function pollDelay(readsDone: number): number {
  return (readsDone <= 4 ? 15 : readsDone <= 8 ? 30 : 60) * 1000
}

/** No read later than this after the first. */
export const POLL_LIMIT_MS = 15 * 60_000

const FINAL = new Set(['settled', 'failed', 'cancelled', 'refunded'])

export interface PaymentStatusState {
  /** The last status read (null: none yet). */
  info: PaymentStatusInfo | null
  /** Settled, failed, cancelled or refunded: nothing more to read. */
  final: boolean
  /** Not final after 15 minutes: the reads have stopped. */
  stopped: boolean
  /** It cannot be read here: no such payment (404), or refused even without the session. */
  unreadable: boolean
  /**
   * Not this account's payment: refused with the session, answered without it (another
   * account's order, or a guest's, paid through its link). The account's pages hold no such order.
   */
  foreign: boolean
  /** A read is on its way. */
  reading: boolean
  /** One more read once the reads have stopped (none while one is on its way). */
  check: () => void
}

type Snapshot = Omit<PaymentStatusState, 'check'> & { uuid: string | null }

const idle = (uuid: string | null): Snapshot => ({
  uuid,
  info: null,
  final: false,
  stopped: false,
  unreadable: false,
  foreign: false,
  reading: false,
})

const isForbidden = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && error.code === 'payment_forbidden'

export function usePaymentStatus(uuid: string | null): PaymentStatusState {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => idle(uuid))
  const checkOnce = useRef<() => void>(() => {})

  useEffect(() => {
    if (!uuid) return
    const payment = uuid
    const controller = new AbortController()
    const patch = (changes: Partial<Snapshot>) =>
      setSnapshot((current) => ({ ...(current.uuid === uuid ? current : idle(uuid)), ...changes }))
    let timer: ReturnType<typeof setTimeout> | undefined
    let readsDone = 0
    let anonymous = false
    let inFlight = false
    let parked = false
    // Final, unreadable or stopped: the schedule is over (a `check` may still read once).
    let over = false
    let started: number | null = null

    const stop = (changes: Partial<Snapshot>) => {
      over = true
      patch({ ...changes, reading: false })
    }
    const later = (ms: number) => {
      if (over) return
      if (Date.now() - (started ?? Date.now()) + ms > POLL_LIMIT_MS) return stop({ stopped: true })
      timer = setTimeout(() => {
        // Hidden: the read waits for the page to show again (`onVisible`).
        if (document.hidden) parked = true
        else void read()
      }, ms)
    }
    async function read(): Promise<void> {
      if (inFlight || controller.signal.aborted) return
      inFlight = true
      started ??= Date.now()
      patch({ reading: true })
      try {
        const info = await readPaymentStatus(payment, { anonymous, signal: controller.signal })
        inFlight = false
        if (controller.signal.aborted) return
        readsDone++
        // Answered only without the session: someone else's payment.
        const foreign = anonymous
        if (FINAL.has(info.status)) return stop({ info, foreign, final: true, stopped: false })
        patch({ info, foreign, reading: false })
        later(pollDelay(readsDone))
      } catch (error) {
        inFlight = false
        if (controller.signal.aborted) return
        // Refused with the session: the same read again, and every later one, without it.
        if (isForbidden(error) && !anonymous) {
          anonymous = true
          return read()
        }
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
          return stop({ unreadable: true })
        }
        patch({ reading: false })
        // Throttled: no read happened; the next waits as long as the API asks.
        const wait = error instanceof ApiError && error.status === 429 ? error.retryAfter : null
        if (wait) return later(wait * 1000)
        // No answer (or a server error): it counts as a read, the schedule goes on.
        readsDone++
        later(pollDelay(readsDone))
      }
    }
    const onVisible = () => {
      if (document.hidden || !parked) return
      parked = false
      // Hidden past the window: no read is due any more.
      if (Date.now() - (started ?? Date.now()) > POLL_LIMIT_MS) return stop({ stopped: true })
      void read()
    }
    checkOnce.current = () => {
      if (over) void read()
    }
    document.addEventListener('visibilitychange', onVisible)
    void read()
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      checkOnce.current = () => {}
    }
  }, [uuid])

  const current = snapshot.uuid === uuid ? snapshot : idle(uuid)
  return {
    info: current.info,
    final: current.final,
    stopped: current.stopped,
    unreadable: current.unreadable,
    foreign: current.foreign,
    reading: current.reading,
    check: () => checkOnce.current(),
  }
}
