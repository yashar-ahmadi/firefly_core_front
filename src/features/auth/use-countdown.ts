'use client'

import { useCallback, useEffect, useState } from 'react'

// The OTP timers (code validity, resend cooldown, a 429's `retry_after`), always from the API's
// seconds. Kept as an absolute deadline: a background tab's throttled timers (or a sleeping
// phone) delay the next tick but never the time shown once it comes. Show `remaining` with the
// Persian formatting helpers (`toPersianDigits`).

export interface Countdown {
  /** Whole seconds left, rounded up; 0 when done. */
  remaining: number
  done: boolean
  /** Starts again from `seconds` (a resend, a `retry_after`). Stable. */
  restart(seconds: number): void
}

interface Clock {
  /** `Date.now()` when it ends; null for no countdown. */
  deadline: number | null
  now: number
}

function clockFor(seconds: number | null): Clock {
  const now = Date.now()
  const valid = seconds !== null && Number.isFinite(seconds) && seconds > 0
  return { deadline: valid ? now + seconds * 1000 : null, now }
}

function remainingOf({ deadline, now }: Clock): number {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
}

/**
 * Counts `seconds` down to 0, from when it is first given (or changes); null, 0 or less is done
 * at once. It re-renders once a second while running, and again as soon as a hidden tab is
 * shown, and stops its timer when done or unmounted.
 */
export function useCountdown(seconds: number | null): Countdown {
  const [clock, setClock] = useState(() => clockFor(seconds))
  // New seconds from the caller (a new code was sent): start again, while rendering.
  const [given, setGiven] = useState(seconds)
  if (!Object.is(given, seconds)) {
    setGiven(seconds)
    setClock(clockFor(seconds))
  }

  const { deadline } = clock
  useEffect(() => {
    if (deadline === null) return
    const end = deadline
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', tick)
    }
    const tick = () => {
      const now = Date.now()
      setClock({ deadline: end, now })
      schedule(now)
    }
    // Wake when the shown second changes (not on a fixed beat that drifts); at the end, stop
    // the timer and the visibility listener too (a restart sets a new deadline: a new effect).
    const schedule = (now: number) => {
      clearTimeout(timer)
      if (now < end) timer = setTimeout(tick, (end - now) % 1000 || 1000)
      else stop()
    }
    document.addEventListener('visibilitychange', tick)
    schedule(Date.now())
    return stop
  }, [deadline])

  const remaining = remainingOf(clock)

  const restart = useCallback((next: number) => setClock(clockFor(next)), [])
  return { remaining, done: remaining === 0, restart }
}
