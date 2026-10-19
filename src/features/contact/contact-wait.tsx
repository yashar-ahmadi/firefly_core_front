'use client'

import { useId } from 'react'
import { useWait, type SubmitLock } from '@/components/form/code-timers'
import { toPersianDigits } from '@/lib/format/digits'
import type { Wait } from '@/lib/forms/waits'
import { waitMinutes } from './contact-errors'

/**
 * Holds «ارسال پیام» for a 429's `retry_after` (content digest §9.2: up to about an hour, until
 * the hour's oldest kept message ages out), with a note of the time left in whole minutes (not a
 * ticking clock: «۵۹ دقیقه»), which describes the button. The moment it ends is read out once.
 */
export function useContactWait(wait: Wait): SubmitLock {
  const { remaining, done, ended } = useWait(wait)
  const noteId = useId()
  const note = (
    <>
      {!done && (
        <p id={noteId} className="text-center text-sm leading-6 text-ink-600">
          {`ارسال پیام تازه تا ${toPersianDigits(String(waitMinutes(remaining)))} دقیقهٔ دیگر ممکن نیست.`}
        </p>
      )}
      <span role="status" className="sr-only">
        {ended ? 'اکنون می\u{200C}توانید دوباره پیام بفرستید.' : ''}
      </span>
    </>
  )
  return { locked: !done, note, noteId }
}
