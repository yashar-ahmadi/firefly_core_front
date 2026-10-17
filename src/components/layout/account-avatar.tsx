'use client'

import { CircleUserRound } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { SKELETON } from '@/components/ui/skeleton'
import { isOptimizable } from '@/components/ui/smart-image'
import { profileInitials } from '@/features/auth/profile-display'
import type { UserProfile } from '@/lib/api/types/account'
import { useOptionalStoreConfig } from '@/lib/config-context'

/**
 * The signed-in visitor's picture, else her initials, else a person icon; a skeleton while the
 * profile loads. Always the same round box (`size-8`, or `className`'s), so nothing moves when
 * the profile comes in. Decorative: the control around it carries the name.
 */
export function AccountAvatar({
  profile,
  loading = false,
  className,
}: {
  profile: UserProfile | null | undefined
  loading?: boolean
  className?: string
}) {
  const config = useOptionalStoreConfig()
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const box = cn('size-8 shrink-0 rounded-full', className)
  if (loading) return <span aria-hidden className={cn(SKELETON, box)} />

  const src = profile?.avatar_picture
  if (src && src !== failedSrc) {
    return (
      <Image
        src={src}
        alt=""
        width={40}
        height={40}
        sizes="40px"
        unoptimized={!isOptimizable(src, config?.mediaOrigin)}
        onError={() => setFailedSrc(src)}
        className={cn(box, 'object-cover')}
      />
    )
  }
  const initials = profile ? profileInitials(profile) : null
  return (
    <span
      aria-hidden
      className={cn(
        box,
        'grid place-items-center',
        initials ? 'bg-brand-100 text-sm font-bold text-brand-800' : 'text-ink-500',
      )}
    >
      {initials ?? <CircleUserRound className="size-6" />}
    </span>
  )
}
