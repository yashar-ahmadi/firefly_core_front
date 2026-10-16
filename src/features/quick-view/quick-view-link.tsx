'use client'

import { ListFilter } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { useHydrated } from '@/components/ui/use-media-query'
import { productPath } from '@/features/catalog/listing-routes'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { openQuickView, preloadQuickView } from './use-quick-view'

const CHOOSE = 'انتخاب ویژگی\u{200C}ها'

const isModified = (event: MouseEvent) =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

export interface QuickViewLinkProps {
  slug: string
  /** Id of the element naming the product (the card's name link). */
  describedBy?: string
  className?: string
}

/**
 * «انتخاب ویژگی‌ها» for a variable product (spec §8.3): the shopper chooses the variant in quick
 * view before anything is added.
 *
 * A link to the product page that JavaScript upgrades. The server HTML (and a page whose
 * scripts never ran) has a plain link, so the control always leads somewhere. Once hydrated it
 * is a button opening quick view (`role="button"`, Space as well as Enter); a modified click
 * (new tab or window) still follows the link, as does a click on a page with no quick view host.
 * A plain `<a>`, not Next's Link: nothing to prefetch, and no router involved in the fallback.
 * While the shop has quick view switched off it stays a link.
 */
export function QuickViewLink({ slug, describedBy, className }: QuickViewLinkProps) {
  const hydrated = useHydrated()
  const enabled = useOptionalStoreConfig()?.features.quickView !== false
  const upgraded = hydrated && enabled

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!upgraded || isModified(event)) return
    if (openQuickView(slug)) event.preventDefault()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== ' ') return
    // A button acts on Space; a link would scroll the page.
    event.preventDefault()
    event.currentTarget.click()
  }

  return (
    <a
      href={productPath(slug)}
      aria-describedby={describedBy}
      onClick={onClick}
      {...(upgraded && {
        role: 'button',
        'aria-haspopup': 'dialog' as const,
        // Not a navigation: pages holding back URL writes while one is pending ignore it.
        'data-opens-dialog': '',
        onKeyDown,
        onPointerEnter: preloadQuickView,
        onFocus: preloadQuickView,
      })}
      className={cn(buttonClasses({ variant: 'outline', size: 'sm', fullWidth: true }), className)}
    >
      <ListFilter aria-hidden />
      {CHOOSE}
    </a>
  )
}
