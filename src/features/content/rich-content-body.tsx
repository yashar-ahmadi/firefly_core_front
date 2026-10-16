'use client'

import { useRouter } from 'next/navigation'
import type { MouseEvent } from 'react'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { isShortLinkPath } from '@/lib/links/short-link'
import { isStorePath, storeHref } from '@/lib/links/store-href'

/**
 * The storefront path a click should route to on the client, or null to leave it to the
 * browser: a modified or non-primary click, a link opening elsewhere (`target`), a download, a
 * hash-only link, another site, and a short link (`/s/<code>`, counted once per request: a full
 * page load counts it exactly once).
 */
function clientRoute(event: MouseEvent<HTMLElement>, siteUrl: string | undefined): string | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const anchor = event.target instanceof Element ? event.target.closest('a') : null
  if (!anchor || !event.currentTarget.contains(anchor)) return null
  const raw = anchor.getAttribute('href')
  if (raw === null || raw.startsWith('#')) return null
  const target = anchor.getAttribute('target')
  if ((target !== null && target !== '' && target !== '_self') || anchor.hasAttribute('download')) {
    return null
  }
  const href = storeHref(raw, siteUrl)
  return isStorePath(href) && !isShortLinkPath(href) ? href : null
}

/**
 * Sanitised operator HTML (from RichContent, on the server). A click on one of its storefront
 * links routes on the client like a Next `Link`, instead of reloading the whole page.
 */
export function RichContentBody({ html, className }: { html: string; className?: string }) {
  const router = useRouter()
  const config = useOptionalStoreConfig()
  return (
    // The links inside are the interactive elements (Enter on one is a click too); this only
    // routes their clicks.
    <div
      className={className}
      onClick={(event) => {
        const href = clientRoute(event, config?.siteUrl)
        if (href === null) return
        event.preventDefault()
        router.push(href)
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
