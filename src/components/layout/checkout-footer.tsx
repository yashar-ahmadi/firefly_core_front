import { Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import type { MenuNode } from '@/lib/api/types/settings'
import { CONTAINER } from './container'
import { FOOTER_HEADING } from './footer-styles'
import { MenuLink } from './menu-link'
import { SupportPhone } from './support-phone'

/** At most this many of the footer menu's pages: the terms, the privacy policy, and so on. */
export const CHECKOUT_FOOTER_LINKS = 4

/** The footer menu's pages (`link_type: 'page'`), children too, in order: no shop links. */
function pagesOf(items: readonly MenuNode[]): MenuNode[] {
  return items.flatMap((item) => [
    ...(item.link_type === 'page' ? [item] : []),
    ...pagesOf(item.children),
  ])
}

export interface CheckoutFooterProps {
  /** E.164 from the settings. */
  phone: string | null
  responseTime: string | null
  /** `menu/footer`: its pages, flat (at most `CHECKOUT_FOOTER_LINKS`). */
  menu: readonly MenuNode[]
  /** The operator's bottom HTML zone (trust seals), or null: under its heading in the footer. */
  trust: ReactNode
  labels: { support: string; phoneSupport: string; trust: string }
}

/**
 * The checkout's quiet footer (ruling P4-R3): the support line and its hours, the footer menu's
 * pages (the terms, the privacy policy) in one row, and the operator's trust seals under
 * «نمادهای اعتماد» as in the shop footer; no columns, shop links or socials.
 */
export function CheckoutFooter({ phone, responseTime, menu, trust, labels }: CheckoutFooterProps) {
  const links = pagesOf(menu).slice(0, CHECKOUT_FOOTER_LINKS)
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
      {trust && (
        <section aria-labelledby="footer-trust" className={cn(CONTAINER, 'pb-6')}>
          <h2 id="footer-trust" className={FOOTER_HEADING}>
            {labels.trust}
          </h2>
          {trust}
        </section>
      )}
    </footer>
  )
}
