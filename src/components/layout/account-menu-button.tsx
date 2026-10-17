'use client'

import { ChevronDown } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DeferredMenu } from '@/components/ui/deferred-menu'
import { profileAvatar, profileName } from '@/features/auth/profile-display'
import { useMe } from '@/features/auth/use-me'
import { useT } from '@/lib/i18n/i18n-context'
import { loadPage } from '@/lib/navigation/hard-navigation'

const loadAccountMenu = () => import('./account-menu').then((module) => module.AccountMenu)

/**
 * Signed in: a menu button with the visitor's avatar (her initial; a skeleton while `useMe`
 * loads, in the same box, so nothing moves), named «حساب کاربری: <name>». The menu's code loads
 * on first use (DeferredMenu); if it cannot be downloaded, the account page is the way on.
 * Loaded by `AccountEntry` only with a session: a guest's page never downloads any of it.
 */
export function AccountMenuButton() {
  const t = useT()
  const { data: me, isPending } = useMe()
  const name = me ? profileName(me) : ''
  return (
    <DeferredMenu
      load={loadAccountMenu}
      props={{}}
      onUnavailable={() => loadPage('/account/')}
      indicator={<ChevronDown aria-hidden className="size-4! text-ink-500" />}
      trigger={
        <Button
          variant="ghost"
          aria-label={name ? t('account_of', { name }) : t('account')}
          // `AccountEntry`'s stand-in while this code loads has the same box.
          className="gap-1.5 px-2.5"
        >
          <Avatar {...profileAvatar(me)} loading={isPending} />
        </Button>
      }
    />
  )
}
