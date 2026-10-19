'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { isBlogPostPath } from '@/lib/links/post-link'
import { isShortLinkPath } from '@/lib/links/short-link'
import { isStorePath, storeHref } from '@/lib/links/store-href'

export interface StoreLinkProps {
  /** An operator URL: a `/…` storefront path (a query is fine) or an absolute http(s) URL. */
  href: string
  children: ReactNode
  className?: string
  /** Opens a new tab (`rel="noopener"`), internal paths too. */
  newTab?: boolean
  /** For a link whose content has no text, e.g. an image-only banner without alt text. */
  'aria-label'?: string
}

/**
 * A link to an operator URL (content.md §6.1). A storefront path, or an absolute URL on the
 * shop's own origin (made a path), is a Next `Link`; anything else a plain `<a rel="noopener">`.
 * A short link (`/s/<code>`) is always a plain `<a>`: every request to it counts a visit, so it
 * must never be prefetched; nor is a blog post (its page counts a view per render, P5-R1). A
 * Client Component (it reads the site URL), usable from Server Components with these
 * serialisable props.
 */
export function StoreLink({
  href,
  children,
  className,
  newTab = false,
  'aria-label': ariaLabel,
}: StoreLinkProps) {
  const config = useOptionalStoreConfig()
  const target = storeHref(href, config?.siteUrl)
  const internal = isStorePath(target)

  if (internal && !newTab && !isShortLinkPath(target)) {
    return (
      <Link
        href={target}
        prefetch={isBlogPostPath(target) ? false : undefined}
        className={className}
        aria-label={ariaLabel}
      >
        {children}
      </Link>
    )
  }
  return (
    <a
      href={target}
      className={className}
      aria-label={ariaLabel}
      target={newTab ? '_blank' : undefined}
      rel={internal && !newTab ? undefined : 'noopener'}
    >
      {children}
    </a>
  )
}
