import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { cn } from '@/components/ui/cn'

/**
 * Clear of the full-height header and the section bar (48px) when a link jumps here natively
 * (no script, or the summary's rating link); the bar's own links compute the spot themselves.
 */
const SCROLL_MARGIN = 'scroll-mt-[calc(var(--header-full)+3.5rem)]'

export interface SectionCardProps {
  /** The section's id: the section bar's `#hash`. Its heading gets `<id>-title`. */
  id: string
  title: string
  children: ReactNode
  className?: string
}

/**
 * One section of the product page under the section bar: a white card named by its heading.
 * Focusable from script (`tabIndex=-1`), so the bar can move the focus to it.
 */
export function SectionCard({ id, title, children, className }: SectionCardProps) {
  const headingId = `${id}-title`
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={cn(SCROLL_MARGIN, 'rounded-card bg-white p-4 shadow-card md:p-6', className)}
    >
      <SectionHeader id={headingId} title={title} />
      {children}
    </section>
  )
}
