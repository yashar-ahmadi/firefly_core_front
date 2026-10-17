'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session/session-context'
import { clearViewerQueries } from '@/lib/session/viewer-queries'
import { authApi } from '../api'
import { safeNext } from '../safe-next'
import { useMe } from '../use-me'
import { AuthCard } from './auth-card'

const ACCOUNT = '/account/'

/**
 * `/login/` for a visitor who is signed in already: said so, with the way on and «خروج». It
 * never redirects by itself (a session the API no longer accepts would bounce back and forth
 * between here and the account): `useMe` asks, and a 401 turns this page into the form.
 */
export function SignedInPanel({ next }: { next: string }) {
  const { data: me } = useMe()
  const client = useQueryClient()
  const { setHasSession } = useSession()
  const [leaving, setLeaving] = useState(false)
  const onward = safeNext(next, ACCOUNT)

  async function logout() {
    setLeaving(true)
    try {
      // The BFF clears the session cookies whatever the API answers.
      await authApi.logout()
    } catch {
      // Signed out on this device anyway (F6: never block on the server).
    }
    setHasSession(false)
    await clearViewerQueries(client)
  }

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
        <Button variant="ghost" size="lg" fullWidth loading={leaving} onClick={() => void logout()}>
          خروج
        </Button>
      </div>
    </AuthCard>
  )
}
