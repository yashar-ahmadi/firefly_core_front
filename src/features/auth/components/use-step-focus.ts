'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Where the focus goes in an auth flow (login, registration, password recovery).
 *
 * On a step change: the new step's first field (`data-autofocus`), else its title; unless a
 * field of the step took it already (the code boxes do). After a failure (`attempt` grows): the
 * first field in error, whose message is its description; else it stays on the control that was
 * pressed, and if that went away with its form (a code that is void), the step's main control
 * (`data-primary`) or title takes it. On the first render nothing moves, unless `autoFocus` (the
 * form took the place of another view of the page).
 */
export function useStepFocus<S extends string>(
  container: RefObject<HTMLDivElement | null>,
  title: RefObject<HTMLHeadingElement | null>,
  { step, attempt }: { step: S; attempt: number },
  autoFocus: boolean,
) {
  const shown = useRef<S | null>(autoFocus ? null : step)
  useEffect(() => {
    if (shown.current === step) return
    shown.current = step
    const root = container.current
    if (!root || (document.activeElement && root.contains(document.activeElement))) return
    const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? title.current
    target?.focus()
  }, [container, title, step])
  useEffect(() => {
    const root = container.current
    if (attempt === 0 || !root) return
    const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (invalid) return invalid.focus()
    if (document.activeElement && root.contains(document.activeElement)) return
    ;(root.querySelector<HTMLElement>('[data-primary]') ?? title.current)?.focus()
  }, [container, title, attempt])
}
