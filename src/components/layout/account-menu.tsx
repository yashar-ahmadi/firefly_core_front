'use client'

import Link from 'next/link'
import { useFirstItemFocus, type DeferredMenuProps } from '@/components/ui/deferred-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/lib/i18n/i18n-context'

/**
 * Signed in: the account menu (Plan 3 adds the summary and sign-out). Loaded on first use by
 * `HeaderActions` (see DeferredMenu), so it starts open.
 */
export function AccountMenu({ trigger, opening }: DeferredMenuProps) {
  const t = useT()
  const firstItemFocus = useFirstItemFocus(opening)
  const links = [
    { href: '/account/', label: t('account') },
    { href: '/account/orders/', label: t('account_orders') },
    { href: '/account/wishlist/', label: t('account_wishlist') },
  ]
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent {...firstItemFocus} align="end">
        {links.map((link) => (
          <DropdownMenuItem key={link.href} asChild>
            <Link href={link.href}>{link.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
