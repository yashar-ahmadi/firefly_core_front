'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { isOptimizable } from '@/components/ui/smart-image'
import { useOptionalStoreConfig } from '@/lib/config-context'

/**
 * The shop's logo, linking home. The box has a fixed size (no layout shift whatever the file's
 * proportions) and the image sits at its start. Without a logo, or when the file fails, the
 * name is shown as a wordmark in its place, named like the image would be.
 */
export function StoreLogo({
  src,
  name,
  className,
}: {
  src: string | null
  name: string
  className?: string
}) {
  const config = useOptionalStoreConfig()
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = Boolean(src) && src !== failedSrc

  return (
    <Link
      href="/"
      className={cn(
        'flex h-10 w-32 shrink-0 items-center rounded-control focus-visible:outline-offset-4 md:w-40',
        className,
      )}
    >
      {showImage && src ? (
        <Image
          src={src}
          alt={name}
          width={160}
          height={40}
          sizes="160px"
          loading="eager"
          fetchPriority="high"
          unoptimized={!isOptimizable(src, config?.mediaOrigin)}
          onError={() => setFailedSrc(src)}
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
