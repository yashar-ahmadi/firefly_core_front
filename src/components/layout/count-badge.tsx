import { cn } from '@/components/ui/cn'
import { toPersianDigits } from '@/lib/format/digits'

/**
 * The count bubble on an icon (cart lines). Hidden from assistive tech: the link's accessible
 * name carries the count. Place it in a `relative` box.
 */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute -end-2 -top-1.5 grid h-5 min-w-5 place-items-center rounded-pill bg-brand px-1 text-sm leading-none font-bold text-brand-fg ring-2 ring-white',
        className,
      )}
    >
      {toPersianDigits(count > 99 ? '99+' : count)}
    </span>
  )
}
