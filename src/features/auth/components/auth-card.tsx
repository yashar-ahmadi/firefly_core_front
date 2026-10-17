import { CircleAlert } from 'lucide-react'
import { useId, type ReactNode, type Ref } from 'react'
import { cn } from '@/components/ui/cn'

// The one card every auth page shows (login, register, forgot password): a step title, an
// optional line under it, and the step's content.

export interface AuthCardProps {
  title: ReactNode
  description?: ReactNode
  /** The title takes the focus on a step change (it is focusable by script only). */
  titleRef?: Ref<HTMLHeadingElement>
  children: ReactNode
  className?: string
}

export function AuthCard({ title, description, titleRef, children, className }: AuthCardProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'mx-auto w-full max-w-md rounded-card bg-white px-5 py-6 shadow-card sm:px-8 sm:py-8',
        className,
      )}
    >
      <h1
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="text-xl leading-9 font-bold text-ink-900 outline-none sm:text-2xl sm:leading-10"
      >
        {title}
      </h1>
      {description && <p className="mt-1 text-base leading-7 text-ink-600">{description}</p>}
      <div className="mt-6 flex flex-col gap-5">{children}</div>
    </section>
  )
}

/** A message about the whole step (role="alert"), with an optional call to action under it. */
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

/** «یا» between two ways of signing in. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-500">
      <span aria-hidden className="h-px flex-1 bg-ink-200" />
      <span>یا</span>
      <span aria-hidden className="h-px flex-1 bg-ink-200" />
    </div>
  )
}
