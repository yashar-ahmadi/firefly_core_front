import { announceRouterNavigation } from '@/lib/navigation/router-navigation'

// Runs in the browser before hydration (Next.js file convention). Keep it tiny: it is on every page.

/** Next calls this when any App Router navigation starts: push, replace, Back and Forward. */
export function onRouterTransitionStart(url: string): void {
  announceRouterNavigation(url)
}
