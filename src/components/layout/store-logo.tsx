'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { isOptimizable } from '@/components/ui/smart-image'
import { useOptionalStoreConfig } from '@/lib/config-context'

/**
 * The shop's logo, linking home. The box has a fixed size (no layout shift whatever the file's
 * proportions) and the image sits at its start. Without a logo, or when every file fails, the
 * name is shown as a wordmark in its place, named like the image would be.
 */
export function StoreLogo({
  src,
  fallbackSrc = null,
  name,
  priority = true,
  className,
}: {
  src: string | null
  /** Tried when `src` is missing or fails (the footer: `logo2`, then `logo`). */
  fallbackSrc?: string | null
  name: string
  /** Load eagerly at high priority (the header); `false` lazy-loads it (the footer). */
  priority?: boolean
  className?: string
}) {
  const config = useOptionalStoreConfig()
  const [failed, setFailed] = useState<readonly string[]>([])
  const shown = [src, fallbackSrc].find(
    (candidate): candidate is string => Boolean(candidate) && !failed.includes(candidate as string),
  )

  return (
    <Link
      href="/"
      className={cn(
        'flex h-10 w-32 shrink-0 items-center rounded-control focus-visible:outline-offset-4 md:w-40',
        className,
      )}
    >
      {shown ? (
        <Image
          key={shown}
          src={shown}
          alt={name}
          width={160}
          height={40}
          sizes="160px"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          unoptimized={!isOptimizable(shown, config?.mediaOrigin)}
          onError={() => setFailed((list) => [...list, shown])}
          // The start side of the box (right in RTL).
          className="size-full object-contain object-right ltr:object-left"
        />
      ) : (
        <span
          role="img"
          aria-label={name}
          className="truncate text-xl leading-10 font-black tracking-tight text-brand-700 md:text-2xl"
        >
          {name}
        </span>
      )}
    </Link>
  )
}
