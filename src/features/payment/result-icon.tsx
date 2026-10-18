import { CircleAlert, CircleCheck, Hourglass, Info } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/spinner'
import type { ResultTone } from './result-copy'

// The result page's large status icon: a check that pops in (success), a turning loader while
// the payment is being checked (the shared Spinner: importing lucide's loader here as well would
// re-export it from a shared chunk, +11 B on every page), an alert (error) or an info mark. Under
// reduced motion nothing moves: the loader gives way to a still hourglass, the pops do not run.
// Decorative (the heading says it all).

const DISC: Record<ResultTone, string> = {
  success: 'bg-success/10 text-success',
  pending: 'bg-brand-50 text-brand-700',
  error: 'bg-danger/10 text-danger',
  info: 'bg-warning/10 text-warning',
}

const ICON = 'size-12 md:size-14'

export function ResultIcon({ tone }: { tone: ResultTone }) {
  return (
    <span
      aria-hidden
      // A new tone mounts a new icon: its pop runs again.
      key={tone}
      data-tone={tone}
      className={cn('grid size-20 shrink-0 place-items-center rounded-full md:size-24', DISC[tone])}
    >
      {tone === 'pending' ? (
        <>
          <Spinner className={cn(ICON, 'motion-reduce:hidden')} />
          <Hourglass className={cn(ICON, 'motion-safe:hidden')} />
        </>
      ) : tone === 'success' ? (
        <CircleCheck className={cn(ICON, 'motion-safe:animate-pop')} />
      ) : tone === 'error' ? (
        <CircleAlert className={cn(ICON, 'motion-safe:animate-pop')} />
      ) : (
        <Info className={cn(ICON, 'motion-safe:animate-pop')} />
      )}
    </span>
  )
}
