import type { Metadata } from 'next'
import { LoginScreen } from '@/features/auth/components/login-screen'
import { firstParam, type SearchParams } from '@/features/auth/search-params'

// Per visitor (the session, `next`): rendered on every request, never cached (P3-R3).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'ورود به حساب کاربری' }

/**
 * `/login/?next=<path>&identifier=<email or mobile>`. `next` is read by `completeLogin` through
 * `safeNext` (a path on this site, else `/account/`); `identifier` prefills the first step
 * (registration and password recovery send it).
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  return (
    <LoginScreen next={firstParam(params.next)} initialIdentifier={firstParam(params.identifier)} />
  )
}
