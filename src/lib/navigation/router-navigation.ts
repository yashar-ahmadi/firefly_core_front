import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useEffectEvent, useState } from 'react'
import { isModifiedClick } from './modified-click'

/**
 * When the page is about to navigate: a click that follows a same-origin link, or the start of
 * any App Router navigation (a `<Link>`, `router.push` from code, Back and Forward), announced
 * by `onRouterTransitionStart` in src/instrumentation-client.ts. Client code that rewrites the
 * URL with `history.replaceState` must hold back meanwhile: Next turns that into a router
 * restore, which discards the navigation in flight.
 */

/** The window event `announceRouterNavigation` dispatches; its `detail` is the target URL. */
export const ROUTER_NAVIGATION_START = 'ff:router-navigation-start'

/** A navigation that has not landed by then went elsewhere (a redirect back here, an error). */
export const PENDING_LIMIT_MS = 10_000

export function announceRouterNavigation(url: string): void {
  window.dispatchEvent(new CustomEvent(ROUTER_NAVIGATION_START, { detail: url }))
}

/**
 * Whether a click follows a link to another page of this shop in this tab: an unmodified primary
 * click on an `<a href>` on the page's own origin, not opening a new tab and not a download. A
 * jump within this page (the skip link, an in-page `#anchor`) does not leave it, nor does a link
 * marked `data-opens-dialog` (it may open something on the page instead: quick view's
 * «انتخاب ویژگی‌ها», the mini-cart, a mega-menu item whose first tap opens its submenu), nor a
 * click a handler has cancelled. Next's `<Link>` cancels its own clicks too: its navigation is
 * announced by the router (`ROUTER_NAVIGATION_START`). Read it once the click's handlers have
 * run, as `onLeavingClick` does.
 */
export function isSameOriginLinkClick(event: MouseEvent): boolean {
  return sameOriginLinkTarget(event) !== null
}

/** The URL a click is about to follow when `isSameOriginLinkClick` holds, else null. */
export function sameOriginLinkTarget(event: MouseEvent): URL | null {
  if (event.defaultPrevented || isModifiedClick(event)) return null
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')) return null
  if (link.hasAttribute('data-opens-dialog')) return null
  const target = link.target.toLowerCase()
  if (target !== '' && target !== '_self') return null
  let url: URL
  try {
    url = new URL(link.href)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin) return null
  const samePage =
    url.pathname === window.location.pathname && url.search === window.location.search
  return samePage && url.hash !== '' ? null : url
}

/**
 * Calls `onLeave` with the target of every click that follows a same-origin link
 * (`sameOriginLinkTarget`), once the click's own handlers have run, so a click one of them
 * cancelled does not count. It listens on `document` in the bubble phase: React's root listener
 * is on `document` too (Next hydrates the whole document) and was added first, at hydration, so
 * it runs before this one. (Not a capture listener plus a microtask: for a real click the
 * browser runs microtasks between listeners, before React's.) Returns the cleanup.
 */
export function onLeavingClick(onLeave: (target: URL) => void): () => void {
  const onClick = (event: MouseEvent) => {
    const target = sameOriginLinkTarget(event)
    if (target) onLeave(target)
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}

function decodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

/**
 * One spelling of a URL for comparing: the path decoded (a Persian slug may arrive encoded or
 * not) and the query as `URLSearchParams` writes it, the form `useSearchParams()` reports.
 */
export function locationKey(pathname: string, search: string): string {
  const query = new URLSearchParams(search).toString()
  return query ? `${decodedPath(pathname)}?${query}` : decodedPath(pathname)
}

/**
 * Calls `onLeave` on every click that follows a same-origin link (`onLeavingClick`: after the
 * click's own handlers, so one that opens a dialog instead does not count) and at the start of
 * every router navigation. Returns whether a router navigation to another URL is pending: from
 * its start until the URL on screen changes, or at most `PENDING_LIMIT_MS`.
 */
export function useLeavingPage(onLeave: () => void): boolean {
  const here = locationKey(usePathname(), useSearchParams().toString())
  // The URL that was on screen when a navigation to another one started.
  const [leavingFrom, setLeavingFrom] = useState<string | null>(null)
  // `url` is the router navigation's target; null for a link click.
  const leaving = useEffectEvent((url: string | null) => {
    onLeave()
    if (url === null) return
    const target = new URL(url, window.location.href)
    if (locationKey(target.pathname, target.search) !== here) setLeavingFrom(here)
  })

  useEffect(() => {
    const stopClicks = onLeavingClick(() => leaving(null))
    const onNavigation = (event: Event) => {
      const url = (event as CustomEvent<unknown>).detail
      if (typeof url === 'string') leaving(url)
    }
    window.addEventListener(ROUTER_NAVIGATION_START, onNavigation)
    return () => {
      stopClicks()
      window.removeEventListener(ROUTER_NAVIGATION_START, onNavigation)
    }
  }, [])

  useEffect(() => {
    if (leavingFrom === null) return
    const timer = setTimeout(() => setLeavingFrom(null), PENDING_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [leavingFrom])

  return leavingFrom === here
}
