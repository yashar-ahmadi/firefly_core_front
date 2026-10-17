import type { Metadata } from 'next'
import { LoginScreen } from '@/features/auth/components/login-screen'

// Per visitor (the session, `next`): rendered on every request, never cached (P3-R3).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'ورود به حساب کاربری' }

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/**
 * `/login/?next=<path>&identifier=<email or mobile>`. `next` is read by `completeLogin` through
 * `safeNext` (a path on this site, else `/account/`); `identifier` prefills the first step.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  return <LoginScreen next={first(params.next)} initialIdentifier={first(params.identifier)} />
}
