import type { Metadata } from 'next'
import { RegisterScreen } from '@/features/auth/components/register-screen'
import { safeNext } from '@/features/auth/safe-next'
import { firstParam, type SearchParams } from '@/features/auth/search-params'
import { registrationTermsHtml } from '@/features/auth/terms'
import { getSiteSettings } from '@/features/settings/api'

// Per visitor (the session, `next`): rendered on every request, never cached (P3-R3). The
// (auth) layout makes it noindex. No loading.tsx (R9).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'ثبت‌نام' }

/**
 * `/register/?next=<path>`. `next` is kept only as a path on this site and is where the new
 * account lands. The URL never carries an identifier (login hands it over apart:
 * `identifier-handoff.ts`; an `?identifier=` is ignored). The operator's terms
 * (`accept_terms_text`) are sanitised here, on the server: the parser never reaches the browser.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()])
  return (
    <RegisterScreen
      next={safeNext(firstParam(params.next), '')}
      termsHtml={registrationTermsHtml(settings?.accept_terms_text ?? null)}
    />
  )
}
