'use client'

import { House, RefreshCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { useT } from '@/lib/i18n/i18n-context'

/** What Next.js passes an `error.tsx` boundary. */
export interface ErrorBoundaryProps {
  error: Error & { digest?: string }
  /** Clears the error and renders the segment again. */
  reset: () => void
  /** Refetches the segment's server data, then renders it again (Next 16). */
  retry: () => void
}

/**
 * The friendly body of an error boundary: «مشکلی پیش آمد», a short reassurance, «تلاش دوباره»
 * (retry: refetch and re-render) and a link home. Server errors carry a digest: it is logged and
 * shown as a reference for support, since it matches the server log line (never the message).
 * The heading takes focus, so screen readers announce what happened. The page is `noindex`.
 */
export function ErrorView({
  error,
  retry,
  className,
}: ErrorBoundaryProps & { className?: string }) {
  const t = useT()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    console.error('[error-boundary]', error.digest ?? '', error)
  }, [error])

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className={cn('flex flex-col items-center px-4 py-14 text-center md:py-20', className)}>
      {/* A streamed error is sent with status 200: keep it out of search results (React hoists
          this into <head>). */}
      <meta name="robots" content="noindex" />
      <div
        aria-hidden
        className="grid size-20 place-items-center rounded-full bg-warning/10 text-warning ring-8 ring-warning/5 [&_svg]:size-9 [&_svg]:stroke-[1.5]"
      >
        <TriangleAlert />
      </div>
      <h1
        ref={heading}
        tabIndex={-1}
        className="mt-6 text-2xl leading-10 font-bold text-ink-900 outline-none"
      >
        {t('error_title')}
      </h1>
      <p className="mt-3 max-w-md text-base leading-8 text-ink-600">{t('error_text')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button iconStart={<RefreshCw aria-hidden />} onClick={() => retry()}>
          {t('retry')}
        </Button>
        <Link href="/" className={buttonClasses({ variant: 'outline' })}>
          <House aria-hidden />
          {t('home_page')}
        </Link>
      </div>
      {error.digest && (
        <p className="mt-8 text-sm text-ink-500">
          {t('error_reference')}: <span dir="ltr">{error.digest}</span>
        </p>
      )}
    </div>
  )
}
