import { useId, type ReactNode, type Ref } from 'react'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/spinner'

// The one card every auth page shows (login, register, forgot password): a step title, an
// optional line under it, and the step's content.

/** Shown when JavaScript is off: no auth form can be sent without it. */
export const NO_SCRIPT = 'برای ورود و ثبت‌نام، جاوااسکریپت مرورگر را فعال کنید.'

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
      <div className="mt-6 flex flex-col gap-5">
        {/* The forms work only with JavaScript (they never submit natively: see AuthForm). */}
        <noscript>
          <p className="rounded-control bg-warning/10 px-4 py-3 text-base leading-7 font-medium text-warning">
            {NO_SCRIPT}
          </p>
        </noscript>
        {children}
      </div>
    </section>
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

/** The last step of a flow, while the page changes: «… انجام شد», «در حال انتقال…». */
export function TransitionCard({
  title,
  titleRef,
}: {
  title: ReactNode
  titleRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <AuthCard title={title} titleRef={titleRef}>
      <p role="status" className="flex items-center gap-2 text-base text-ink-700">
        <Spinner />
        در حال انتقال…
      </p>
    </AuthCard>
  )
}

/** A page that cannot offer its form now (no settings, or closed by the operator): why, and on. */
export function AuthUnavailable({
  title,
  message,
  action,
}: {
  title: ReactNode
  message: ReactNode
  action: ReactNode
}) {
  return (
    <AuthCard title={title}>
      <p className="text-base leading-7 text-ink-700">{message}</p>
      {action}
    </AuthCard>
  )
}
