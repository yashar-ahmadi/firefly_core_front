'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { toPersianDigits } from '@/lib/format'
import { cn } from './cn'
import { clockNow, subscribeClock } from './clock'

const SECOND = 1000
const DAY_SECONDS = 86_400
const PLACEHOLDER = '--:--:--'

interface Parts {
  days: number
  hms: [string, string, string]
}

function parts(ms: number): Parts {
  // Round up, so the display reaches ۰۰:۰۰:۰۰ exactly when the time is up.
  const total = Math.max(0, Math.ceil(ms / SECOND))
  const days = Math.floor(total / DAY_SECONDS)
  const rest = total % DAY_SECONDS
  const pad = (n: number) => toPersianDigits(String(n).padStart(2, '0'))
  return {
    days,
    hms: [pad(Math.floor(rest / 3600)), pad(Math.floor(rest / 60) % 60), pad(rest % 60)],
  }
}

/** «۰۱:۰۲:۰۳», or «۲ روز و ۰۱:۰۲:۰۳» from 24 hours up. Negative values show zero. */
export function formatCountdown(ms: number): string {
  const { days, hms } = parts(ms)
  const time = hms.join(':')
  return days > 0 ? `${toPersianDigits(days)} روز و ${time}` : time
}

function toEpochMs(endsAt: string | number): number {
  return typeof endsAt === 'number' ? endsAt : Date.parse(endsAt)
}

export interface CountdownProps {
  /** End time: an ISO 8601 string or epoch milliseconds. */
  endsAt: string | number
  /** Called once when the countdown reaches zero. */
  onEnd?: () => void
  /** `plain` is inline text; `boxed` shows each unit in its own tile (timed deals). */
  variant?: 'plain' | 'boxed'
  className?: string
}

/**
 * Time left until `endsAt`, updated every second. The server renders «--:--:--» and the
 * clock starts after mount, so hydration never mismatches. Not a live region: screen readers
 * read it on demand instead of every second.
 */
export function Countdown({ endsAt, onEnd, variant = 'plain', className }: CountdownProps) {
  const end = toEpochMs(endsAt)
  const secondsLeft = useSyncExternalStore(
    subscribeClock,
    () => {
      const now = clockNow()
      return now === null || Number.isNaN(end) ? null : Math.max(0, Math.ceil((end - now) / SECOND))
    },
    () => null,
  )

  const onEndRef = useRef(onEnd)
  const firedFor = useRef<number | null>(null)
  useEffect(() => {
    onEndRef.current = onEnd
  })
  useEffect(() => {
    if (secondsLeft === 0 && firedFor.current !== end) {
      firedFor.current = end
      onEndRef.current?.()
    }
  }, [secondsLeft, end])

  const text = secondsLeft === null ? PLACEHOLDER : formatCountdown(secondsLeft * SECOND)
  const timerProps = { role: 'timer', 'aria-live': 'off' } as const

  if (variant === 'plain') {
    return (
      <span {...timerProps} className={cn('font-medium tabular-nums', className)}>
        {text}
      </span>
    )
  }

  const { days, hms } =
    secondsLeft === null ? { days: 0, hms: ['--', '--', '--'] } : parts(secondsLeft * SECOND)
  return (
    <span {...timerProps} className={cn('inline-flex items-center gap-2', className)}>
      {days > 0 && <span className="font-medium">{`${toPersianDigits(days)} روز و `}</span>}
      <span dir="ltr" className="inline-flex items-center gap-1">
        {hms.map((unit, i) => (
          <span key={i} className="contents">
            {i > 0 && <span className="font-bold text-ink-700">:</span>}
            <span className="grid h-8 min-w-8 place-items-center rounded-control bg-ink-900 px-1 text-base font-bold text-white tabular-nums">
              {unit}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}
