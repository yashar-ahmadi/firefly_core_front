'use client'

import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

export interface AuthFormProps {
  /** The step's main action; the request goes from here, never from the browser itself. */
  onSubmit: () => void
  className?: string
  children: ReactNode
}

/**
 * Every auth step's form (login, registration, password recovery). It never submits natively:
 * a GET would put what was typed (names, an email address or a mobile number) in the URL, the
 * history and the server logs.
 *
 * - Its `SubmitButton` is disabled until the page has hydrated, which also stops Enter in a field
 *   (implicit submission needs an enabled default button); from then on `onSubmit` handles it.
 * - `method="post"` keeps even a submission that slips through from being a GET: the values go
 *   in the body, and Next renders the page again for a form POST that is no Server Action.
 */
export function AuthForm({ onSubmit, className, children }: AuthFormProps) {
  return (
    <form
      method="post"
      noValidate
      className={cn('flex flex-col', className)}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}
