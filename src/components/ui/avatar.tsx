'use client'

import { CircleUserRound } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { cn } from './cn'
import { SKELETON } from './skeleton'
import { isOptimizable } from './smart-image'

export type AvatarSize = 'sm' | 'md' | 'lg'

const SIZES: Record<AvatarSize, { box: string; letter: string; icon: string; px: number }> = {
  sm: { box: 'size-8', letter: 'text-sm', icon: 'size-6', px: 32 },
  md: { box: 'size-10', letter: 'text-base', icon: 'size-7', px: 40 },
  lg: { box: 'size-14', letter: 'text-xl', icon: 'size-10', px: 56 },
}

export interface AvatarProps {
  /** The picture (an absolute URL); falls back to the letter if it cannot be loaded. */
  src?: string | null
  /** One letter (`profileInitial`); null: a person icon. */
  initial?: string | null
  /** A skeleton in the same box while the person is not known yet. */
  loading?: boolean
  size?: AvatarSize
  className?: string
}

/**
 * A person's round avatar: the picture, else one letter, else a person icon; a skeleton while
 * loading. Always the same box for a size, so nothing moves when the data comes in. Decorative:
 * the control or the text beside it carries the name.
 */
export function Avatar({ src, initial, loading = false, size = 'sm', className }: AvatarProps) {
  const config = useOptionalStoreConfig()
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const { box: boxSize, letter, icon, px } = SIZES[size]
  const box = cn('shrink-0 rounded-full', boxSize, className)
  if (loading) return <span aria-hidden className={cn(SKELETON, box)} />

  if (src && src !== failedSrc) {
    return (
      <Image
        src={src}
        alt=""
        width={px}
        height={px}
        sizes={`${px}px`}
        unoptimized={!isOptimizable(src, config?.mediaOrigin)}
        onError={() => setFailedSrc(src)}
        className={cn(box, 'object-cover')}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        box,
        'grid place-items-center',
        initial ? cn('bg-brand-100 leading-none font-bold text-brand-800', letter) : 'text-ink-500',
      )}
    >
      {initial ?? <CircleUserRound className={icon} />}
    </span>
  )
}
