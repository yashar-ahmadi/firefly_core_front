import { ChevronLeft, House } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

export interface BreadcrumbItem {
  name: string
  /** Ignored on the last item, which is always the current page. */
  href?: string
}

/** 44px tall rows; long names are cut at 12rem (18rem from md). */
const ITEM = 'block max-w-48 truncate leading-11 md:max-w-72'
/** The focus ring is drawn inside: the scrolling row would clip it outside. */
const LINK =
  'rounded-control text-ink-600 transition-colors hover:text-brand-700 focus-visible:-outline-offset-2'

/**
 * The page's place in the shop: a home icon (named «خانه»), then the items, separated by chevrons
 * pointing left (the reading direction). The last item is the current page: plain text with
 * `aria-current="page"`, never a link. Long names are cut with an ellipsis (the full name is the
 * tooltip) and the row scrolls sideways on narrow screens, with no visible scrollbar and a fade
 * at its far end. Visual only: the BreadcrumbList JSON-LD comes from the pages.
 */
export async function Breadcrumbs({
  items,
  className,
}: {
  items: readonly BreadcrumbItem[]
  className?: string
}) {
  const t = createTranslator(await getTranslations())
  const last = items.length - 1
  return (
    <nav aria-label={t('breadcrumb')} className={cn('min-w-0', className)}>
      <ol
        className={cn(
          'flex items-center overflow-x-auto pe-6 text-sm whitespace-nowrap',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          // Fade the far (left) end, where hidden items wait to be scrolled into view.
          '[mask-image:linear-gradient(to_right,transparent,#000_1.5rem)]',
        )}
      >
        <li className="flex shrink-0 items-center">
          <Link
            href="/"
            aria-label={t('home')}
            aria-current={items.length === 0 ? 'page' : undefined}
            className={cn(LINK, 'grid size-11 place-items-center')}
          >
            <House aria-hidden className="size-5" />
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={`${index}-${item.name}`} className="flex min-w-0 shrink-0 items-center">
            <ChevronLeft aria-hidden className="mx-1 size-4 shrink-0 text-ink-400" />
            {index === last || !item.href ? (
              <span
                dir="auto"
                title={item.name}
                aria-current={index === last ? 'page' : undefined}
                className={cn(ITEM, index === last ? 'font-medium text-ink-900' : 'text-ink-600')}
              >
                {item.name}
              </span>
            ) : (
              <Link href={item.href} dir="auto" title={item.name} className={cn(ITEM, LINK)}>
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
