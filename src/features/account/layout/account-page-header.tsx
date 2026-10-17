'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode, Ref } from 'react'
import { useT } from '@/lib/i18n/i18n-context'
import { ACCOUNT_HOME } from './nav-items'

/**
 * The heading of an account page other than the dashboard: below lg, where the side navigation
 * is not shown, a link back to the hub (the dashboard lists every page) above the page's h1.
 * The page's main action («افزودن آدرس جدید») sits at the h1's end, below it when it must wrap.
 * With `headingRef` the h1 can take the focus from script (after the row that had it went).
 */
export function AccountPageHeader({
  title,
  action,
  headingRef,
}: {
  title: string
  action?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const t = useT()
  return (
    <div className="mb-4 md:mb-6">
      <Link
        href={ACCOUNT_HOME}
        className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-base font-medium text-ink-700 transition-colors hover:text-ink-900 lg:hidden"
      >
        <ArrowRight aria-hidden className="size-5 ltr:rotate-180" />
        <span className="sr-only">بازگشت به</span> {t('account_area')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="rounded-control text-xl leading-9 font-bold text-ink-900 outline-none focus-visible:ring-4 focus-visible:ring-(--focus) md:text-2xl md:leading-10"
        >
          {title}
        </h1>
        {action}
      </div>
    </div>
  )
}
