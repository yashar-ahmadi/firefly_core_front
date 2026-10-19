'use client'

import { useEffect, useRef } from 'react'

/** How much of `target` is behind the reader: 0 before its top reaches the viewport's, 1 at its end. */
function progressOf(target: HTMLElement): number {
  const { top, height } = target.getBoundingClientRect()
  const distance = height - window.innerHeight
  if (distance <= 0) return top <= 0 ? 1 : 0
  return Math.min(1, Math.max(0, -top / distance))
}

/**
 * A thin bar along the top of the window that fills (from the start side) as the post
 * (`targetId`) is read. Decorative: `aria-hidden` (the page's own scroll position says as much).
 * Fixed, and moved by a transform written straight to the element, so nothing shifts and nothing
 * re-renders: one passive scroll (and resize) listener, at most one update a frame; eased only
 * when motion is welcome.
 */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = document.getElementById(targetId)
    const bar = barRef.current
    if (!target || !bar) return
    let frame = 0
    const update = () => {
      frame = 0
      bar.style.transform = `scaleX(${progressOf(target)})`
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [targetId])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1">
      <div
        ref={barRef}
        data-reading-progress=""
        style={{ transform: 'scaleX(0)' }}
        className="h-full origin-right bg-brand motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out"
      />
    </div>
  )
}
