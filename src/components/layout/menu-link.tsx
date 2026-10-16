'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import type { MenuNode } from '@/lib/api/types/settings'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { isShortLinkPath } from '@/lib/links/short-link'
import { isStorePath, storeHref } from '@/lib/links/store-href'

export interface MenuLinkProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  node: MenuNode
  /** Called when the link is followed, e.g. to close the menu it sits in. */
  onNavigate?: () => void
  /** Show the node's icon (20px, decorative) before the title. */
  withIcon?: boolean
  /** Replaces the title as the visible label. */
  children?: ReactNode
  /** Next.js prefetching for storefront paths (default: Next's own). */
  prefetch?: boolean | null
}

/** An operator icon: a plain image, never inline SVG markup; hidden if it fails to load. */
export function MenuIcon({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <Image
      src={src}
      alt=""
      width={20}
      height={20}
      unoptimized
      onError={() => setFailed(true)}
      className={cn('size-5 shrink-0 object-contain', className)}
    />
  )
}

/**
 * One menu item as a link (content.md §5.4): a group heading (`url: null`) is a `<span>`,
 * `open_in_new_tab` opens a new tab with `rel="noopener"` (internal paths too), a storefront
 * path is a Next `Link`, and any other URL a plain `<a>`. A short link (`/s/<code>`) is a plain
 * `<a>` too: every request to it counts a visit, so it must never be prefetched. The URL is used
 * as the API sends it.
 */
export function MenuLink({
  node,
  onNavigate,
  withIcon = false,
  children,
  prefetch,
  onClick,
  ...props
}: MenuLinkProps) {
  const config = useOptionalStoreConfig()
  const content = (
    <>
      {withIcon && node.icon && <MenuIcon src={node.icon} />}
      {children ?? node.title}
    </>
  )
  if (node.url === null) return <span {...props}>{content}</span>

  const href = storeHref(node.url, config?.siteUrl)
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event)
    // A handler that cancels the click (a first tap that only opens a submenu) is not a visit.
    if (!event.defaultPrevented) onNavigate?.()
  }
  if (node.open_in_new_tab) {
    return (
      <a href={href} target="_blank" rel="noopener" onClick={handleClick} {...props}>
        {content}
      </a>
    )
  }
  if (isStorePath(href) && !isShortLinkPath(href)) {
    return (
      <Link href={href} prefetch={prefetch} onClick={handleClick} {...props}>
        {content}
      </Link>
    )
  }
  return (
    <a href={href} onClick={handleClick} {...props}>
      {content}
    </a>
  )
}
