import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AccountShell } from '@/features/account/layout/account-shell'
import { COOKIE } from '@/lib/auth/cookies'
import { isJwt } from '@/lib/bff/session'
import { ACCOUNT_LOGIN_FALLBACK } from '@/lib/edge/account-guard'

// The account area (ruling P3-R1: inside the shop layout, so the shop header, footer and widget
// hosts stay around it). Per visitor: rendered on every request, never cached, never indexed
// (P3-R3). No loading.tsx: each page shows its own skeletons while its data loads.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * The session guard and the account shell. The proxy has already sent a visitor without a
 * session to login, with the page and its query as `next` (it sees the URL; a layout does not:
 * see `account-guard.ts`). This check covers the requests the proxy skips (router prefetches).
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const refresh = (await cookies()).get(COOKIE.refresh)?.value
  if (!isJwt(refresh)) redirect(ACCOUNT_LOGIN_FALLBACK)
  return <AccountShell>{children}</AccountShell>
}
