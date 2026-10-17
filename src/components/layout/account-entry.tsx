'use client'

import { ChevronDown, CircleUserRound, LogIn } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, type FocusEvent } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { SKELETON } from '@/components/ui/skeleton'
import { SHEET_SIDE_QUERY, useMediaQuery } from '@/components/ui/use-media-query'
import { useFeature } from '@/features/settings/feature-context'
import { useT } from '@/lib/i18n/i18n-context'
import { loginHref } from '@/lib/links/login'
import { useSession } from '@/lib/session/session-context'

/** The signed-in button's box, for its stand-ins: a ghost button around a 32px avatar. */
const ACCOUNT_BOX = cn(buttonClasses({ variant: 'ghost' }), 'gap-1.5 px-2.5')

/**
 * The signed-in button's silhouette: while its code loads, and wherever it is not mounted (the
 * server render, hydration, and phones, where the slot is hidden).
 */
function AccountButtonPending() {
  return (
    <span aria-hidden className={ACCOUNT_BOX}>
      <span className={cn(SKELETON, 'size-8 rounded-full')} />
      <ChevronDown className="size-4! text-ink-500" />
    </span>
  )
}

/** Its code could not be downloaded: the account page, as a plain link. */
function AccountPageLink() {
  const t = useT()
  return (
    <Link href="/account/" aria-label={t('account')} className={cn(ACCOUNT_BOX, 'text-ink-500')}>
      <CircleUserRound aria-hidden className="size-6!" />
    </Link>
  )
}

// The signed-in button (the profile, the avatar, the menu loader) is code a guest never needs,
// and a phone never shows (the slot is hidden below md; the bottom bar links the account): it
// loads only with a session, from md, once the page has hydrated.
const AccountMenuButton = dynamic(
  () =>
    import('./account-menu-button')
      .then((module) => module.AccountMenuButton)
      .catch(() => AccountPageLink),
  { loading: AccountButtonPending },
)

/**
 * The header's account slot (from md; phones use the bottom bar): «ورود | ثبت‌نام» back to this
 * page for a guest, the account menu button for a signed-in visitor. The button mounts only from
 * md (`SHEET_SIDE_QUERY`), after hydration; until then its silhouette holds the same box, so the
 * header does not move, and a phone never downloads its code nor reads the profile. When the
 * session ends while the focus is in the menu or on its button (logging out from it), the login
 * link that takes their place takes the focus too, instead of leaving it on the page's body.
 */
export function AccountEntry() {
  const t = useT()
  const pathname = usePathname() ?? '/'
  const { hasSession } = useSession()
  const registration = useFeature('registration').enabled
  const wide = useMediaQuery(SHEET_SIDE_QUERY)
  const login = useRef<HTMLAnchorElement>(null)
  // Focus inside the slot, its menu included (a portal: React events bubble from it to here).
  const focused = useRef(false)
  const wasSignedIn = useRef(hasSession)

  useEffect(() => {
    if (wasSignedIn.current && !hasSession && focused.current) {
      const lost = document.activeElement === null || document.activeElement === document.body
      if (lost) login.current?.focus()
    }
    wasSignedIn.current = hasSession
  }, [hasSession])

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) focused.current = false
  }

  return (
    // Flex: the silhouette (a span) and the button sit in the same place (no baseline offset).
    <div className="flex" onFocus={() => (focused.current = true)} onBlur={onBlur}>
      {hasSession ? (
        wide ? (
          <AccountMenuButton />
        ) : (
          <AccountButtonPending />
        )
      ) : (
        <Link
          ref={login}
          href={loginHref(pathname)}
          className={cn(buttonClasses({ variant: 'outline' }), 'gap-2 px-4')}
        >
          <LogIn aria-hidden className="rtl:-scale-x-100" />
          {t(registration ? 'login_register' : 'login')}
        </Link>
      )}
    </div>
  )
}
