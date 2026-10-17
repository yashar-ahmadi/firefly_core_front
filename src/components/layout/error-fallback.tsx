'use client'

import { useEffect, useRef } from 'react'
import type { ErrorBoundaryProps } from '@/components/layout/error-view'
import { useT } from '@/lib/i18n/i18n-context'
import { reloadPage } from '@/lib/navigation/hard-navigation'

/**
 * The root error boundary's message when its view (`ErrorView`) cannot load: its chunk is gone
 * after a deploy, or the connection is. The same words, a reload instead of the retry (a fresh
 * page brings fresh chunks), a plain link home and the server error's reference for support,
 * and nothing the shop layout's chunks carry (no next/link, Button or icons; see
 * src/app/error.tsx), so it costs the page almost nothing.
 */
export function ErrorFallback({ error }: ErrorBoundaryProps) {
  const t = useT()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    console.error('[error-boundary]', error.digest ?? '', error)
  }, [error])

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-14 text-center">
      <meta name="robots" content="noindex" />
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-2xl leading-10 font-bold text-ink-900 outline-none"
      >
        {t('error_title')}
      </h1>
      <p className="mt-3 max-w-md text-base leading-8 text-ink-600">{t('error_text')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reloadPage}
          className="h-11 rounded-control bg-brand px-5 text-base font-medium text-brand-fg shadow-sm hover:bg-brand-700"
        >
          {t('retry')}
        </button>
        {/* A full page load (fresh chunks), and no next/link code in the root boundary's group,
            as global-error.tsx does. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-flex h-11 items-center rounded-control border border-ink-300 bg-white px-5 text-base font-medium text-ink-800 hover:bg-ink-50"
        >
          {t('home_page')}
        </a>
      </div>
      {error.digest && (
        <p className="mt-8 text-sm text-ink-500">
          {t('error_reference')}: <span dir="ltr">{error.digest}</span>
        </p>
      )}
    </div>
  )
}
