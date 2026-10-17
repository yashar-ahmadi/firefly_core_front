'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { safeNext } from '../safe-next'
import { useLogout } from '../use-logout'
import { useMe } from '../use-me'
import { AuthCard } from './auth-card'

const ACCOUNT = '/account/'

/**
 * `/login/` for a visitor who is signed in already: said so, with the way on and «خروج»
 * (`useLogout`: home afterwards, like the header's). It never redirects by itself (a session the
 * API no longer accepts would bounce back and forth between here and the account): `useMe` asks,
 * and a 401 turns this page into the form.
 */
export function SignedInPanel({ next }: { next: string }) {
  const { data: me } = useMe()
  const { logout, pending } = useLogout()
  const onward = safeNext(next, ACCOUNT)

  return (
    <AuthCard
      title="شما وارد شده‌اید"
      description={
        me?.full_name ? `با حساب «${me.full_name}» وارد شده‌اید.` : 'با حساب خود وارد شده‌اید.'
      }
    >
      <div className="flex flex-col gap-3">
        {onward !== ACCOUNT && (
          <Button asChild size="lg" fullWidth>
            <Link href={onward}>ادامه</Link>
          </Button>
        )}
        <Button asChild size="lg" fullWidth variant={onward === ACCOUNT ? 'primary' : 'outline'}>
          <Link href={ACCOUNT}>حساب کاربری من</Link>
        </Button>
        <Button variant="ghost" size="lg" fullWidth loading={pending} onClick={() => void logout()}>
          خروج
        </Button>
      </div>
    </AuthCard>
  )
}
