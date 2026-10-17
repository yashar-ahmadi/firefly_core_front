'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useEffectEvent, useState } from 'react'
import { cn } from '@/components/ui/cn'
import {
  PENDING_LIMIT_MS,
  ROUTER_NAVIGATION_START,
  locationKey,
  onLeavingClick,
} from '@/lib/navigation/router-navigation'

type Phase = 'idle' | 'loading' | 'done'

interface Progress {
  phase: Phase
  /** The URL on screen when the navigation started. */
  from: string
  /** Counts navigations, so a new one restarts the bar. */
  run: number
}

/** How long the full bar fades out after the page arrived. */
const DONE_MS = 300

/**
 * A thin bar along the top of the window while a client navigation is on its way (the shop has
 * no `loading.tsx`, R9, so nothing else shows that a click was taken). It starts on every App
 * Router navigation (`ROUTER_NAVIGATION_START`, from src/instrumentation-client.ts) and on an
 * unmodified click on a same-origin link that no handler cancelled (`onLeavingClick`: a link that
 * opens a dialog instead never starts it), and completes when the URL on screen (path or query)
 * changes.
 * A navigation that never lands (a redirect back here, an error) hides it after 10 s.
 *
 * Decorative (`aria-hidden`); while it runs, `<main>` carries `aria-busy="true"`. With reduced
 * motion it is a static full-width bar, with no growth and no fade.
 */
export function NavigationProgress({ mainId = 'main' }: { mainId?: string }) {
  const here = locationKey(usePathname(), useSearchParams().toString())
  const [progress, setProgress] = useState<Progress>({ phase: 'idle', from: here, run: 0 })

  // The page arrived: finish while rendering the new URL, not one effect later.
  if (progress.phase === 'loading' && progress.from !== here) {
    setProgress({ ...progress, phase: 'done' })
  }

  const start = useEffectEvent((target: URL) => {
    if (locationKey(target.pathname, target.search) === here) return
    setProgress((current) =>
      // A link click and the router's own signal announce the same navigation: one run.
      current.phase === 'loading' && current.from === here
        ? current
        : { phase: 'loading', from: here, run: current.run + 1 },
    )
  })
  const reset = useEffectEvent(() => setProgress((current) => ({ ...current, phase: 'idle' })))

  useEffect(() => {
    const stopClicks = onLeavingClick((target) => start(target))
    const onNavigation = (event: Event) => {
      const url = (event as CustomEvent<unknown>).detail
      if (typeof url === 'string') start(new URL(url, window.location.href))
    }
    // Back to a page kept in the back-forward cache after a full page load: it is not loading.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset()
    }
    window.addEventListener(ROUTER_NAVIGATION_START, onNavigation)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      stopClicks()
      window.removeEventListener(ROUTER_NAVIGATION_START, onNavigation)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  const { phase, run } = progress
  useEffect(() => {
    if (phase === 'idle') return
    const timer = setTimeout(
      () =>
        setProgress((current) => (current.run === run ? { ...current, phase: 'idle' } : current)),
      phase === 'loading' ? PENDING_LIMIT_MS : DONE_MS,
    )
    return () => clearTimeout(timer)
  }, [phase, run])

  useEffect(() => {
    if (phase !== 'loading') return
    const main = document.getElementById(mainId)
    main?.setAttribute('aria-busy', 'true')
    return () => main?.removeAttribute('aria-busy')
  }, [phase, mainId])

  return (
    <div
      aria-hidden="true"
      data-navigation-progress=""
      className="pointer-events-none fixed inset-x-0 top-0 z-[110] h-[3px]"
    >
      {phase !== 'idle' && (
        <div
          key={run}
          data-phase={phase}
          className={cn(
            // RTL: the bar grows from the right, the start side.
            'h-full origin-right bg-brand-600',
            phase === 'loading'
              ? 'motion-safe:animate-nav-progress'
              : 'motion-safe:animate-nav-progress-done motion-reduce:hidden',
          )}
        />
      )}
    </div>
  )
}
