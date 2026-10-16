import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface DisclosureProps {
  /** The summary's text, inside a heading of `level` (default 3). */
  title: ReactNode
  level?: 2 | 3 | 4
  children: ReactNode
  /** Disclosures sharing a name open one at a time where the browser supports it. */
  name?: string
  className?: string
  summaryClassName?: string
  contentClassName?: string
}

/**
 * A native disclosure (`<details>`/`<summary>`) in the look of the kit's Accordion, for content
 * that only folds: the footer columns on phones, an FAQ. It ships no JavaScript, works without
 * it, and keeps its content in the HTML while closed (search engines read it). The summary is a
 * 56px target with the page's focus ring; its title is a heading, and the chevron turns while
 * open. A Server Component. Use the Radix `Accordion` where state is controlled from code.
 */
export function Disclosure({
  title,
  level = 3,
  children,
  name,
  className,
  summaryClassName,
  contentClassName,
}: DisclosureProps) {
  const Heading = `h${level}` as const
  return (
    <details
      name={name}
      className={cn('group/disclosure border-b border-ink-200 last:border-b-0', className)}
    >
      <summary
        className={cn(
          'group/summary flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-start text-base font-medium text-ink-900',
          'transition-colors duration-150 hover:text-brand-800 [&::-webkit-details-marker]:hidden',
          summaryClassName,
        )}
      >
        <Heading className="min-w-0">{title}</Heading>
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-600 transition-colors group-hover/summary:bg-brand-50 group-hover/summary:text-brand-700"
        >
          <ChevronDown className="size-5 group-open/disclosure:rotate-180 motion-safe:transition-transform motion-safe:duration-200" />
        </span>
      </summary>
      <div className={cn('pb-4 text-base text-ink-700', contentClassName)}>{children}</div>
    </details>
  )
}
