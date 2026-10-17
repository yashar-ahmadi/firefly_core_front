import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { storeName } from '@/app/_shell/metadata'
import { StoreLogo } from '@/components/layout/store-logo'
import { getStoreConfig } from '@/config/store-config'
import { getSiteSettings } from '@/features/settings/api'
import { SnippetHtmlZone } from '@/features/settings/snippets'

// The auth pages (login; register and password recovery come next) are per visitor: never
// cached, never indexed (ruling P3-R3). No loading.tsx (R9).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: true } }

/**
 * A quiet frame for signing in: the shop's logo (home) and a way back, the page's card, and no
 * shop header, footer or bottom navigation. Inside the root Providers like every page. The card
 * hangs from a fixed distance below the top, never centred: a step that grows (a message, the
 * code boxes) or an on-screen keyboard then moves nothing above it.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings()
  const name = storeName(getStoreConfig(), settings)
  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="mx-auto flex h-16 w-full max-w-md items-center justify-between gap-3 px-4">
        <StoreLogo src={settings?.logo ?? null} name={name} />
        <Link
          href="/"
          className="-me-3 inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-base text-ink-700 hover:text-ink-900"
        >
          <ArrowRight aria-hidden className="size-5" />
          بازگشت به فروشگاه
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col px-4 pt-2 pb-10 outline-none sm:pt-10 lg:pt-14"
      >
        {children}
      </main>
      <SnippetHtmlZone position="bottom" />
    </div>
  )
}
