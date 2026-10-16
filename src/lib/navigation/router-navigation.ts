import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useEffectEvent, useState } from 'react'

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
const PENDING_LIMIT_MS = 10_000

export function announceRouterNavigation(url: string): void {
  window.dispatchEvent(new CustomEvent(ROUTER_NAVIGATION_START, { detail: url }))
}

/**
 * Whether a click follows a link to this shop in this tab: an unmodified primary click on an
 * `<a href>` on the page's own origin, not opening a new tab and not a download.
 */
export function isSameOriginLinkClick(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false
  }
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')) return false
  const target = link.target.toLowerCase()
  if (target !== '' && target !== '_self') return false
  try {
    return new URL(link.href).origin === window.location.origin
  } catch {
    return false
  }
}

/** pathname + search, as Next's hooks report the URL on screen. */
function locationKey(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname
}

/**
 * Calls `onLeave` on every same-origin link click (document capture: before the link's own
 * handlers run) and at the start of every router navigation. Returns whether a router navigation
 * to another URL is pending: from its start until the URL on screen changes, or at most
 * `PENDING_LIMIT_MS`.
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
    if (locationKey(target.pathname, target.search.slice(1)) !== here) setLeavingFrom(here)
  })

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isSameOriginLinkClick(event)) leaving(null)
    }
    const onNavigation = (event: Event) => {
      const url = (event as CustomEvent<unknown>).detail
      if (typeof url === 'string') leaving(url)
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener(ROUTER_NAVIGATION_START, onNavigation)
    return () => {
      document.removeEventListener('click', onClick, true)
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
