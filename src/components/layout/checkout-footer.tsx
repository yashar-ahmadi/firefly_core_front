import { Clock } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import type { MenuNode } from '@/lib/api/types/settings'
import { CONTAINER } from './container'
import { MenuLink } from './menu-link'
import { SupportPhone } from './support-phone'

/** The footer menu's links in one row (its legal pages): every item with a link, children too. */
function linksOf(items: readonly MenuNode[]): MenuNode[] {
  return items.flatMap((item) => [...(item.url ? [item] : []), ...linksOf(item.children)])
}

export interface CheckoutFooterProps {
  /** E.164 from the settings. */
  phone: string | null
  responseTime: string | null
  /** `menu/footer`: its links, flat. */
  menu: readonly MenuNode[]
  labels: { support: string; phoneSupport: string }
}

/**
 * The checkout's quiet footer (ruling P4-R3): the support line and its hours, and the footer
 * menu's links (the terms, the privacy policy) in one row; no columns, socials or seals.
 */
export function CheckoutFooter({ phone, responseTime, menu, labels }: CheckoutFooterProps) {
  const links = linksOf(menu)
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div
        className={cn(
          CONTAINER,
          'flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between',
        )}
      >
        {(phone || responseTime) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {phone && (
              <SupportPhone phone={phone} label={labels.support} iconLabel={labels.phoneSupport} />
            )}
            {responseTime && (
              <p className="flex items-center gap-1.5 text-sm leading-6 text-ink-600">
                <Clock aria-hidden className="size-4 shrink-0" />
                {responseTime}
              </p>
            )}
          </div>
        )}
        {links.length > 0 && (
          <ul className="flex flex-wrap gap-x-4">
            {links.map((node) => (
              <li key={node.id}>
                <MenuLink
                  node={node}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center text-sm text-ink-600 hover:text-brand-700"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  )
}
