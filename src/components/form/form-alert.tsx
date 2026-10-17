import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * A message about the whole form or step (role="alert"), with an optional call to action under
 * it. Shared by the auth steps and the account forms.
 */
export function FormAlert({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-base text-danger">
      <p className="flex items-start gap-2 leading-7 font-medium">
        <CircleAlert aria-hidden className="mt-1.5 size-4 shrink-0" />
        <span>{children}</span>
      </p>
      {action && <div className="mt-2 ps-6">{action}</div>}
    </div>
  )
}
