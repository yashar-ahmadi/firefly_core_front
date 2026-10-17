import { Skeleton } from '@/components/ui/skeleton'

/** The avatar section while the profile loads: the picture's circle, a button, the hint line. */
export function AvatarSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6"
    >
      <Skeleton className="size-24 shrink-0 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11 w-36" />
        <span className="flex h-6 items-center">
          <Skeleton className="h-3.5 w-48" />
        </span>
      </div>
    </div>
  )
}
