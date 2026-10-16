import { ChevronLeft } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { StoreLink } from '@/lib/links/store-link'

export interface SectionHeaderProps {
  /** The heading's id, for `aria-labelledby`. */
  id: string
  title: string
  subtitle?: string
  /** The see-all link (the operator's label, else the dictionary's) at the inline end. */
  link?: { href: string; label: string } | null
}

/**
 * The one header style of every page section and product rail (homepage sections, recently
 * viewed, later related products): a 44px row with an accent bar and the title (h2) at the
 * start and the see-all link at the inline end, the subtitle under it. Empty parts are left out.
 */
export function SectionHeader({ id, title, subtitle = '', link = null }: SectionHeaderProps) {
  if (!title && !subtitle && !link) return null
  return (
    <div className="mb-3 md:mb-4">
      {(title || link) && (
        <div className="flex min-h-11 items-center justify-between gap-x-4">
          {title ? (
            <h2
              id={id}
              className="flex min-w-0 items-center gap-2 text-lg leading-8 font-bold text-ink-900 md:text-xl md:leading-9"
            >
              <span aria-hidden className="h-5 w-1 shrink-0 rounded-pill bg-brand" />
              <span className="min-w-0">{title}</span>
            </h2>
          ) : (
            <span />
          )}
          {link && (
            <StoreLink
              href={link.href}
              className="-me-1 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-control px-1 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
            >
              {link.label}
              <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
            </StoreLink>
          )}
        </div>
      )}
      {subtitle && (
        <p className={cn('text-sm leading-6 text-ink-600 md:text-base', title && 'ps-3')}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
