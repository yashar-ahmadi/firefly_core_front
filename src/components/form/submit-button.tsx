'use client'

import { Button, type ButtonProps } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useHydrated } from '@/components/ui/use-media-query'
import type { SubmitLock } from './code-timers'

/**
 * The step's main button (`data-primary`). While its request is on the way it shows a spinner,
 * and while a 429's wait runs (`lock`) it shows the time left; either way it does nothing more
 * but stays focusable (`aria-disabled`), so the focus is still there when the answer comes.
 * Before the page has hydrated it is disabled (the server HTML too), so neither a press nor Enter
 * in a field can submit the form natively (see `AuthForm`).
 */
export function SubmitButton({
  busy,
  lock,
  children,
  ...props
}: ButtonProps & { busy: boolean; lock?: SubmitLock }) {
  const hydrated = useHydrated()
  const locked = lock?.locked ?? false
  return (
    <>
      <Button
        type="submit"
        size="lg"
        fullWidth
        data-primary=""
        aria-disabled={busy || locked || undefined}
        aria-busy={busy || undefined}
        aria-describedby={locked ? lock?.noteId : undefined}
        iconStart={busy ? <Spinner /> : undefined}
        {...props}
        disabled={!hydrated || props.disabled}
      >
        {children}
      </Button>
      {lock?.note}
    </>
  )
}
