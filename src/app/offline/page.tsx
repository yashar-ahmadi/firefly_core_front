import { WifiOff } from 'lucide-react'
import type { Metadata } from 'next'
import { buttonClasses } from '@/components/ui/button-styles'
import { OfflineRetry } from '@/features/pwa/offline-retry'
import { OFFLINE_MESSAGE, OFFLINE_TITLE } from '@/features/pwa/offline-text'
import { shopName } from '@/features/seo/shop-name'

export const metadata: Metadata = {
  title: OFFLINE_TITLE,
  robots: { index: false, follow: false },
}

/**
 * `/offline/`: what the service worker shows for a navigation the network cannot answer (Plan 5
 * Task 6, src/features/pwa/sw-offline.ts). The worker keeps it at install as the anonymous copy
 * the server allows, so it is shown from that copy: nothing here needs the API once kept (the
 * shop's name was written in when it was kept; without settings, the preset's label). Light: the
 * root layout alone, no shop shell; the retry reloads the address the visitor asked for, and the
 * way home is a full page load, which the worker answers from the home page's copy.
 */
export default async function OfflinePage() {
  const name = await shopName()
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center px-4 py-10 text-center md:py-16"
    >
      {/* Full page loads: the worker answers them offline; the router's fetch would fail first. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        dir="auto"
        className="inline-flex min-h-11 items-center rounded-control px-3 text-xl font-bold text-ink-900 hover:text-brand-800"
      >
        {name}
      </a>
      <div className="mt-10 flex w-full max-w-xl flex-col items-center md:mt-14">
        <span className="flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <WifiOff aria-hidden className="size-8" />
        </span>
        <h1 className="mt-5 text-2xl leading-10 font-bold text-ink-900 md:text-3xl md:leading-12">
          {OFFLINE_TITLE}
        </h1>
        <p className="mt-3 text-base leading-8 text-ink-600">{OFFLINE_MESSAGE}</p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <OfflineRetry />
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={buttonClasses({ variant: 'outline' })}>
            صفحهٔ اصلی
          </a>
        </div>
      </div>
    </main>
  )
}
