import type { Metadata } from 'next'
import { LoginScreen } from '@/features/auth/components/login-screen'
import { firstParam, type SearchParams } from '@/features/auth/search-params'

// Per visitor (the session, `next`): rendered on every request, never cached (P3-R3).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'ورود به حساب کاربری' }

/**
 * `/login/?next=<path>`. `next` is read by `completeLogin` through `safeNext` (a path on this
 * site, else `/account/`). The URL never carries an identifier: registration and password
 * recovery hand it over apart (`identifier-handoff.ts`), and an `?identifier=` is ignored.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  return <LoginScreen next={firstParam(params.next)} />
}
