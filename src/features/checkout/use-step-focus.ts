'use client'

import { useEffect, useRef } from 'react'
import type { CheckoutStep } from './checkout-steps'
import { stepHeadingId } from './step-header'

/**
 * When the step changes while the shopper works in the page, its heading takes the focus: the
 * focus is in the page, or was until what had it went with the step that closed (a radio of the
 * receiver step). Never on its own after a load (nothing focused there yet), nor away from a
 * field of the new step that took it (a refused receiver's first field in error).
 */
export function useStepFocus(step: CheckoutStep) {
  const page = useRef<HTMLDivElement>(null)
  const last = useRef(step)
  const inPage = useRef(false)
  useEffect(() => {
    const track = (event: FocusEvent) => {
      const target = event.target as Node | null
      inPage.current = !!target && (page.current?.contains(target) ?? false)
    }
    document.addEventListener('focusin', track)
    return () => document.removeEventListener('focusin', track)
  }, [])
  useEffect(() => {
    if (last.current === step) return
    last.current = step
    const active = document.activeElement
    const lost = active === null || active === document.body
    const heading = document.getElementById(stepHeadingId(step))
    // Already inside the new step (its first field in error took it): it stays there.
    if (heading?.closest('section')?.contains(active)) return
    if (lost ? inPage.current : (page.current?.contains(active) ?? false)) heading?.focus()
  }, [step])
  return page
}
