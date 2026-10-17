'use client'

import { useId, useState, type ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/spinner'
import { toPersianDigits } from '@/lib/format'
import { useCountdown, type Countdown } from '../use-countdown'
import type { Wait } from './waits'

// The waits of the login steps, always the API's seconds (`resend_after`, `expires_in`, a 429's
// `retry_after`). The ticking time is plain text; only the moment a wait ends is read out, in a
// polite region that is on the page from the start.

/** «۰۱:۵۹»: minutes and seconds, in Persian digits. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  return toPersianDigits(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`)
}

/** What is left of a wait ending at `until` (epoch ms), in seconds; 0 for no wait. */
function secondsUntil(until: number): number {
  return until === 0 ? 0 : (until - Date.now()) / 1000
}

export interface WaitState extends Countdown {
  /** The wait ran out while shown here: the moment to say so (once, not on every tick). */
  ended: boolean
}

/**
 * Counts down to `wait.until`, from what is left of it whenever the timer is shown, and starts
 * over for each new wait (`seq`), even one as long as the last (a resend that waits 120 s again).
 */
export function useWait(wait: Wait): WaitState {
  const countdown = useCountdown(null)
  const [seq, setSeq] = useState<number | null>(null)
  const [ran, setRan] = useState(false)
  if (seq !== wait.seq) {
    setSeq(wait.seq)
    setRan(false)
    countdown.restart(secondsUntil(wait.until))
  } else if (!countdown.done && !ran) {
    setRan(true)
  }
  return { ...countdown, ended: ran && countdown.done }
}

/** A polite live region, present while empty; says `message` once `when` turns true. */
function EndNotice({ when, message }: { when: boolean; message: string }) {
  return (
    <span role="status" className="sr-only">
      {when ? message : ''}
    </span>
  )
}

export interface SendCodeButtonProps {
  label: string
  wait: Wait
  busy: boolean
  onSend: () => void
  variant?: ButtonVariant
}

/**
 * «ارسال کد» or «ارسال مجدد کد». While the wait runs it stays focusable but does nothing
 * (`aria-disabled`), described by the time left; a press while busy does nothing either.
 */
export function SendCodeButton({
  label,
  wait,
  busy,
  onSend,
  variant = 'primary',
}: SendCodeButtonProps) {
  const { remaining, done, ended } = useWait(wait)
  const waitId = useId()
  const blocked = !done || busy
  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <Button
        variant={variant}
        size={variant === 'primary' ? 'lg' : 'md'}
        fullWidth
        aria-disabled={blocked || undefined}
        aria-busy={busy || undefined}
        aria-describedby={done ? undefined : waitId}
        data-primary={variant === 'primary' ? '' : undefined}
        iconStart={busy ? <Spinner /> : undefined}
        onClick={() => {
          if (!blocked) onSend()
        }}
      >
        {label}
      </Button>
      {!done && (
        <p id={waitId} className="text-center text-sm leading-6 text-ink-600 tabular-nums">
          {`ارسال دوباره پس از ${formatClock(remaining)}`}
        </p>
      )}
      <EndNotice when={ended} message="اکنون می‌توانید کد را دوباره بخواهید." />
    </div>
  )
}

/** How long the code sent is valid (`expires_in`), and that it expired. */
export function CodeExpiry({ wait }: { wait: Wait }) {
  const { remaining, done, ended } = useWait(wait)
  return (
    <>
      <p className={cn('text-sm leading-6 tabular-nums', done ? 'text-danger' : 'text-ink-600')}>
        {done
          ? 'کد منقضی شده است؛ کد تازه بخواهید.'
          : `کد تا ${formatClock(remaining)} دیگر معتبر است.`}
      </p>
      <EndNotice when={ended} message="اعتبار کد تمام شد." />
    </>
  )
}

/** A step's main action held back by a wait: the time left (`noteId`), its end read out once. */
export interface SubmitLock {
  locked: boolean
  note: ReactNode
  noteId: string
}

/**
 * Holds a step's main action for the length of a 429's wait (throttled, `auth_totp_locked`):
 * `locked` while it runs, with a `note` of the time left that describes the button.
 */
export function useSubmitWait(wait: Wait): SubmitLock {
  const { remaining, done, ended } = useWait(wait)
  const noteId = useId()
  const note = (
    <>
      {!done && (
        <p id={noteId} className="text-center text-sm leading-6 text-ink-600 tabular-nums">
          {`زمان باقی‌مانده تا تلاش دوباره: ${formatClock(remaining)}`}
        </p>
      )}
      <EndNotice when={ended} message="اکنون می‌توانید دوباره تلاش کنید." />
    </>
  )
  return { locked: !done, note, noteId }
}
