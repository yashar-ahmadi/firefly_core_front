'use client'

import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { profileAvatar, profileContact, profileName } from '@/features/auth/profile-display'
import { useMe } from '@/features/auth/use-me'

/**
 * Who is signed in, at the top of the account navigation: the avatar (one letter or the
 * picture), the name and the email or mobile number (`profile-display`). While the profile
 * loads, a skeleton in the avatar's box and a line for each text: the 56px avatar sets the
 * row's height either way, so nothing moves when the profile comes in.
 */
export function AccountHeader({ className }: { className?: string }) {
  const { data: me, isPending } = useMe()
  const contact = me ? profileContact(me) : null
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Avatar {...profileAvatar(me)} loading={isPending} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isPending ? (
          <>
            <span className="flex h-7 items-center">
              <Skeleton className="h-4.5 w-28" />
            </span>
            <span className="flex h-6 items-center">
              <Skeleton className="h-3.5 w-40" />
            </span>
          </>
        ) : (
          <>
            <p className="truncate text-lg leading-7 font-bold text-ink-900">
              {me ? profileName(me) : null}
            </p>
            {contact && (
              // Left to right as a whole: a long email is cut at its end, never its start.
              <p dir="ltr" className="truncate text-right text-sm leading-6 text-ink-600">
                {contact}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
