'use client'

import { CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { formatNumber } from '@/lib/format'
import type { MarkAllState } from './use-mark-all'

export const MARK_ALL = 'علامت‌گذاری همه به‌عنوان خوانده‌شده'

/** «۳ از ۱۰»: how far «علامت‌گذاری همه» has gone. */
export function progressText({ done, total }: Pick<MarkAllState, 'done' | 'total'>): string {
  return `${formatNumber(done)} از ${formatNumber(total)}`
}

export interface MarkAllButtonProps {
  state: MarkAllState
  /** The unread count, once it is known. */
  unread: number | undefined
  onStart: () => void
}

/**
 * «علامت‌گذاری همه به‌عنوان خوانده‌شده» at the inbox's heading: off while nothing is unread (or
 * the count is not in yet). While it runs it stays focusable but inert, with a spinner and how
 * far it has gone; the status line under it says the same and why it stopped.
 */
export function MarkAllButton({ state, unread, onStart }: MarkAllButtonProps) {
  const running = state.phase === 'running' || state.phase === 'waiting'
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!running && !(unread !== undefined && unread > 0)}
      aria-disabled={running || undefined}
      aria-busy={running || undefined}
      iconStart={running ? <Spinner size="sm" /> : <CheckCheck aria-hidden />}
      onClick={() => {
        if (!running) onStart()
      }}
    >
      {MARK_ALL}
      {running && state.total > 0 && (
        <span className="text-ink-600 tabular-nums">({progressText(state)})</span>
      )}
    </Button>
  )
}

/** Under the heading: what «علامت‌گذاری همه» is doing, read out as it changes. */
export function MarkAllStatus({ state }: { state: MarkAllState }) {
  if (state.phase === 'failed') {
    return (
      <p role="alert" className="text-base text-danger">
        علامت‌گذاری همه متوقف شد: {state.failure}
      </p>
    )
  }
  let text = ''
  if (state.phase === 'running' && state.total > 0) {
    text = `${progressText(state)} اعلان خوانده شد.`
  } else if (state.phase === 'waiting') {
    text = `${progressText(state)} اعلان خوانده شد؛ کمی صبر کنید، بقیه خودکار ادامه می‌یابد.`
  }
  return (
    <p role="status" className="text-sm text-ink-600">
      {text}
    </p>
  )
}
