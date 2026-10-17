'use client'

import { CircleCheck } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'

// The frame every section of the profile page shares, and its small parts.

export interface ProfileSectionProps {
  title: string
  /** A line under the title (static: shown while the profile loads too). */
  description?: ReactNode
  /** Beside the title, e.g. two-step login's state. */
  badge?: ReactNode
  /** The data is not in yet: a skeleton in place of the content, the region marked busy. */
  loading?: boolean
  /** How many fields the default skeleton draws. */
  skeletonFields?: number
  /** A skeleton shaped like the content, in place of the default fields. */
  skeleton?: ReactNode
  children?: ReactNode
}

/**
 * One card of the profile page: a `section` named by its h2, which saves on its own (its own
 * messages, its own success line) and shows its own skeleton while its data loads.
 */
export function ProfileSection({
  title,
  description,
  badge,
  loading = false,
  skeletonFields = 2,
  skeleton,
  children,
}: ProfileSectionProps) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      aria-busy={loading || undefined}
      className="rounded-card bg-white p-4 shadow-card md:p-6"
    >
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={id} className="text-lg leading-8 font-bold text-ink-900">
          {title}
        </h2>
        {badge}
      </div>
      {description && <p className="mt-1 text-base leading-7 text-ink-600">{description}</p>}
      <div className="mt-4">
        {loading ? (skeleton ?? <FieldsSkeleton fields={skeletonFields} />) : children}
      </div>
    </section>
  )
}

/** Fields while the data loads: a label line and a 48px box each, then a button. */
export function FieldsSkeleton({ fields }: { fields: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <span className="flex h-6 items-center">
            <Skeleton className="h-4 w-24" />
          </span>
          <Skeleton className="h-12 w-full sm:max-w-md" />
        </div>
      ))}
      <Skeleton className="h-11 w-full sm:w-36" />
    </div>
  )
}

/**
 * The last save, said in place («… ذخیره شد.»). It is read out through the shop's polite
 * region by whoever saved (`announce`), so a second identical save is heard again.
 */
export function SavedNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="flex items-start gap-2 text-base leading-7 font-medium text-success">
      <CircleCheck aria-hidden className="mt-1 size-5 shrink-0" />
      {message}
    </p>
  )
}

/** The profile forms' main buttons: full width on phones, as wide as their words from sm. */
export const FORM_BUTTON = cn('sm:w-auto sm:self-start')
