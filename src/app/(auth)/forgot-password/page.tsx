import type { Metadata } from 'next'
import { ForgotPasswordScreen } from '@/features/auth/components/forgot-password-screen'
import { safeNext } from '@/features/auth/safe-next'
import { firstParam, type SearchParams } from '@/features/auth/search-params'

// Per visitor (the session): rendered on every request, never cached (P3-R3). The (auth) layout
// makes it noindex. No loading.tsx (R9).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'بازیابی رمز عبور' }

/**
 * `/forgot-password/?next=<path>`, from the login page's «فراموشی رمز عبور». `next` (a path on
 * this site) is carried to the login page afterwards. The URL never carries an identifier (login
 * hands it over apart: `identifier-handoff.ts`; an `?identifier=` is ignored).
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  return <ForgotPasswordScreen next={safeNext(firstParam(params.next), '')} />
}
