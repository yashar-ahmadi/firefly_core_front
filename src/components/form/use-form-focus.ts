'use client'

import { useEffect, type RefObject } from 'react'

/**
 * After a failed save (`attempt` grows), the first field in error takes the focus; its message
 * is its description. Without one the focus stays where it was (the button pressed), and the
 * form's alert is read out.
 */
export function useFormFocus(container: RefObject<HTMLElement | null>, attempt: number): void {
  useEffect(() => {
    if (attempt === 0) return
    container.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [container, attempt])
}
