import { Check, X } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import type { ProgressState, ProgressView } from '../progress'

// An order's progress (order digest §6.2), drawn exactly as given: the server's bar on the
// account's order (`progressFromServer`), or the one tracking derives (`progressFromTracking`).
// A list in order, each step's state said in words, never by colour alone («انجام شده», «مرحلهٔ
// کنونی», «پیش رو»), with the moment it was reached (Jalali, Tehran time); the current step is
// `aria-current="step"`. An order that ended (cancelled, returned) ends in its ending, drawn and
// said as such («پایان سفارش»). Down the page on a phone, across it from `md`; the line between
// two steps is coloured once the first is done. No state: a server component as well.

export const STATE_TEXT: Record<ProgressState, string> = {
  completed: 'انجام شده',
  current: 'مرحلهٔ کنونی',
  upcoming: 'پیش رو',
}

export const ENDING_TEXT = 'پایان سفارش'

function Marker({ state, ending }: { state: ProgressState; ending: boolean }) {
  const base =
    'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 [&_svg]:size-4'
  if (ending) {
    return (
      <span aria-hidden className={cn(base, 'border-danger bg-danger text-white')}>
        <X strokeWidth={3} />
      </span>
    )
  }
  if (state === 'completed') {
    return (
      <span aria-hidden className={cn(base, 'border-brand bg-brand text-brand-fg')}>
        <Check strokeWidth={3} />
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span aria-hidden className={cn(base, 'border-brand bg-white')}>
        <span className="size-3 rounded-full bg-brand" />
      </span>
    )
  }
  return <span aria-hidden className={cn(base, 'border-ink-200 bg-white')} />
}

/** «۱۸ مرداد ۱۴۰۵، ساعت ۱۷:۰۰», wrapping only between the day and the time (narrow steps). */
function Reached({ iso }: { iso: string }) {
  const [day, ...time] = formatJalaliDateTime(iso).split('، ')
  return (
    <time dateTime={iso} className="text-sm leading-6 text-ink-600">
      <span className="whitespace-nowrap">{day}</span>
      {time.length > 0 && (
        <>
          {'، '}
          <span className="whitespace-nowrap">{time.join('، ')}</span>
        </>
      )}
    </time>
  )
}

export interface OrderProgressProps {
  progress: ProgressView
  className?: string
}

export function OrderProgress({ progress, className }: OrderProgressProps) {
  return (
    <ol aria-label="مراحل سفارش" className={cn('flex flex-col md:flex-row', className)}>
      {progress.steps.map((step, index) => {
        const ending = progress.terminal && step.state === 'current'
        const current = step.state === 'current'
        return (
          <li
            key={`${step.key}-${index}`}
            aria-current={current ? 'step' : undefined}
            data-state={step.state}
            data-terminal={ending ? '' : undefined}
            className={cn(
              'relative flex gap-3 pb-5 last:pb-0',
              // The line to the next step: down from the marker; across from md.
              'after:absolute after:start-[15px] after:top-9 after:bottom-1 after:w-0.5 after:rounded-full last:after:hidden',
              'md:flex-1 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center',
              'md:after:start-[calc(50%+1.25rem)] md:after:top-[15px] md:after:bottom-auto md:after:h-0.5 md:after:w-[calc(100%-2.5rem)]',
              step.state === 'completed' ? 'after:bg-brand' : 'after:bg-ink-200',
            )}
          >
            <Marker state={step.state} ending={ending} />
            <span className="flex min-w-0 flex-col gap-0.5 pt-0.5 md:px-1 md:pt-0">
              <span
                data-step-label
                className={cn(
                  'text-base leading-7',
                  current ? 'font-bold text-ink-900' : 'font-medium text-ink-800',
                  ending && 'text-danger',
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  'text-sm leading-6',
                  current && !ending ? 'font-medium text-brand-700' : 'text-ink-600',
                )}
              >
                {ending ? ENDING_TEXT : STATE_TEXT[step.state]}
              </span>
              {step.reached_at && <Reached iso={step.reached_at} />}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
