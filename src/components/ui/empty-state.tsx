import type { ReactNode } from 'react'
import { cn } from './cn'

export interface EmptyStateProps {
  /** A Lucide icon element, e.g. `<ShoppingCart />`; it is sized and coloured here. */
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  /** The next step, usually a Button. */
  action?: ReactNode
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3
  className?: string
}

/** A centred "nothing here yet" message that always offers a next step when it can. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div className={cn('flex flex-col items-center px-4 py-10 text-center', className)}>
      <div
        aria-hidden
        className="mb-5 grid size-20 place-items-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/60 [&_svg]:size-9 [&_svg]:stroke-[1.5]"
      >
        {icon}
      </div>
      <Heading className="text-lg leading-8 font-bold text-ink-900">{title}</Heading>
      {description && <p className="mt-1.5 max-w-sm text-base text-ink-600">{description}</p>}
      {action && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>
      )}
    </div>
  )
}
