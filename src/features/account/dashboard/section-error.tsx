'use client'

import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/lib/i18n/i18n-context'

export interface SectionErrorProps {
  /** What could not be shown, e.g. «خلاصه‌ی حساب بارگذاری نشد.» */
  message: string
  onRetry: () => void
  /** The retry's read is on its way: a spinner, the button stays pressable (and focused). */
  retrying: boolean
  className?: string
}

/**
 * A dashboard section that could not be read: what is missing and «تلاش دوباره». The rest of
 * the page stays usable. The button is never disabled while it retries, so the focus stays on
 * it; a second press just starts the read again.
 */
export function SectionError({ message, onRetry, retrying, className }: SectionErrorProps) {
  const t = useT()
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-6 text-center sm:flex-row sm:gap-4',
        className,
      )}
    >
      <span className="flex items-center gap-2 text-base text-ink-700">
        <TriangleAlert aria-hidden className="size-5 shrink-0 text-warning" />
        {message}
      </span>
      <Button
        variant="outline"
        size="sm"
        aria-busy={retrying || undefined}
        onClick={onRetry}
        iconStart={retrying ? <Spinner size="sm" /> : <RefreshCw aria-hidden />}
      >
        {t('retry')}
      </Button>
    </div>
  )
}
