'use client'

import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useSubmitWait } from '@/features/auth/components/code-timers'
import { NO_WAIT, type Wait } from '@/features/auth/components/waits'
import { ApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/i18n-context'

/** A 429 (`throttled`): no fault of the visitor's, nothing to fix but time. */
export const THROTTLED_MESSAGE = 'لطفاً کمی بعد دوباره تلاش کنید.'

/** A 429's wait, from when the answer came (`retry_after`, digest §0.7). */
export function throttleWait(error: unknown, answeredAt: number): Wait {
  if (!(error instanceof ApiError) || error.status !== 429 || !error.retryAfter) return NO_WAIT
  return { until: answeredAt + error.retryAfter * 1000, seq: answeredAt }
}

export interface ListErrorProps {
  /** What could not be shown, e.g. «دیدگاه‌ها بارگذاری نشد.» */
  message: string
  error: unknown
  /** When the error came (`query.errorUpdatedAt`): a 429's wait counts from then. */
  errorAt: number
  onRetry: () => void
  /** The retry's read is on its way: a spinner; the button stays focused. */
  retrying: boolean
}

/**
 * An account list that could not be read: what is missing and «تلاش دوباره». A 429 says
 * calmly to wait instead, and «تلاش دوباره» waits out `retry_after` (focusable, inert, described
 * by the time left; its end is read out).
 */
export function ListError({ message, error, errorAt, onRetry, retrying }: ListErrorProps) {
  const t = useT()
  const throttled = error instanceof ApiError && error.status === 429
  const lock = useSubmitWait(throttleWait(error, errorAt))
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-white px-4 py-8 text-center shadow-card">
      <p className="flex items-center gap-2 text-base text-ink-700">
        <TriangleAlert aria-hidden className="size-5 shrink-0 text-warning" />
        {throttled ? THROTTLED_MESSAGE : message}
      </p>
      <Button
        variant="outline"
        size="sm"
        aria-busy={retrying || undefined}
        aria-disabled={lock.locked || undefined}
        aria-describedby={lock.locked ? lock.noteId : undefined}
        onClick={() => {
          if (!lock.locked) onRetry()
        }}
        iconStart={retrying ? <Spinner size="sm" /> : <RefreshCw aria-hidden />}
      >
        {t('retry')}
      </Button>
      {lock.note}
    </div>
  )
}
