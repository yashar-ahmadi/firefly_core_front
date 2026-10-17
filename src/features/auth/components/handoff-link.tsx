'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { isModifiedClick } from '@/lib/navigation/modified-click'
import { handOffIdentifier, type AuthPage } from '../identifier-handoff'

export interface HandoffLinkProps {
  /** The auth page it opens. */
  page: AuthPage
  /** Its URL: the page, with `next` at most (`auth-links.ts`). */
  href: string
  /** What the visitor typed, for that page to prefill. */
  identifier: string
  className?: string
  children: ReactNode
}

/**
 * A link to another auth page that takes what the visitor typed with it, without putting it in
 * the URL (`identifier-handoff.ts`). Opened elsewhere (a new tab or window), it takes nothing.
 */
export function HandoffLink({ page, href, identifier, className, children }: HandoffLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (!isModifiedClick(event)) handOffIdentifier(page, identifier)
      }}
    >
      {children}
    </Link>
  )
}
