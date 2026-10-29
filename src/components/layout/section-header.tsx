import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { StoreLink } from '@/lib/links/store-link'

export interface SectionHeaderProps {
  /** The heading's id, for `aria-labelledby`. */
  id: string
  title: string
  subtitle?: string
  /** The see-all link (the operator's label, else the dictionary's) at the inline end. */
  link?: { href: string; label: string } | null
  /** A control at the inline end instead of a link (recently viewed's «پاک کردن»). */
  action?: ReactNode
  /** `center`: the title, the subtitle under it and the link under both, centred. */
  align?: 'start' | 'center'
}

/**
 * The one header style of every page section and product rail (homepage sections, recently
 * viewed, related products): a 44px row with an accent bar and the title (h2) at the start and
 * the see-all link (or an action) at the inline end, the subtitle under it. Empty parts are left
 * out. Centred (`align`), a section that stands alone (a statement, a stats band) has its title
 * underlined by a short accent bar and its link under the subtitle.
 */
export function SectionHeader({
  id,
  title,
  subtitle = '',
  link = null,
  action = null,
  align = 'start',
}: SectionHeaderProps) {
  if (!title && !subtitle && !link && !action) return null
  if (align === 'center') {
    return (
      <div className="mx-auto mb-4 flex max-w-3xl flex-col items-center text-center md:mb-6">
        {title && (
          <h2
            id={id}
            className="flex flex-col items-center gap-2 text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10"
          >
            <span className="min-w-0">{title}</span>
            <span aria-hidden className="h-1 w-10 rounded-pill bg-brand" />
          </h2>
        )}
        {subtitle && <p className="mt-2 text-base leading-7 text-ink-600">{subtitle}</p>}
        {link && (
          <StoreLink
            href={link.href}
            className="mt-1 inline-flex min-h-11 items-center gap-0.5 rounded-control px-1 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            {link.label}
            <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
          </StoreLink>
        )}
        {!link && action}
      </div>
    )
  }
  return (
    <div className="mb-3 md:mb-4">
      {(title || link || action) && (
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
          {!link && action}
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
