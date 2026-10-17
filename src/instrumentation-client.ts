import { announceRouterNavigation } from '@/lib/navigation/router-navigation'

// Runs in the browser before hydration (Next.js file convention). Keep it tiny: it is on every page.

/**
 * Next calls this when any App Router navigation starts (push, replace, Back and Forward), from
 * inside the navigation's own `startTransition`. A state update made right here would join that
 * transition and wait with it until the new page arrives: the progress bar would only show once
 * there is nothing left to wait for. So the page hears of it in a microtask, once that scope has
 * closed, still before the next paint.
 */
export function onRouterTransitionStart(url: string): void {
  queueMicrotask(() => announceRouterNavigation(url))
}
