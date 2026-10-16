'use client'

import { getImageProps } from 'next/image'
import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import { isOptimizable } from '@/components/ui/smart-image'
import { useOptionalStoreConfig } from '@/lib/config-context'

/** Where `mobile_image` replaces `image` (content.md §6.3). */
const MOBILE_MEDIA = '(max-width: 767px)'

export interface PromoImageProps {
  image: string
  /** null: `image` on every screen. */
  mobileImage: string | null
  alt: string
  /** Rendered widths, as for next/image. */
  sizes: string
  /** The page's LCP image: load it now, first. Everything else loads lazily. */
  priority?: boolean
  /** `contain` never crops (banners whose text is part of the picture). */
  fit?: 'cover' | 'contain'
}

/**
 * A slide or banner picture filling its positioned frame: a `<picture>` whose
 * `<source media="(max-width: 767px)">` serves the mobile image, optimised like next/image. If
 * the picture cannot load it is removed, so the frame's own background shows instead of a
 * broken-image icon.
 */
export function PromoImage({
  image,
  mobileImage,
  alt,
  sizes,
  priority = false,
  fit = 'cover',
}: PromoImageProps) {
  const origin = useOptionalStoreConfig()?.mediaOrigin
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === image) return null

  const props = (src: string) =>
    getImageProps({
      src,
      alt,
      fill: true,
      sizes,
      unoptimized: !isOptimizable(src, origin),
      loading: priority ? 'eager' : 'lazy',
      fetchPriority: priority ? 'high' : undefined,
    }).props
  const main = props(image)
  const mobile = mobileImage ? props(mobileImage) : null

  return (
    <picture>
      {mobile && (
        <source
          media={MOBILE_MEDIA}
          srcSet={mobile.srcSet ?? mobile.src}
          sizes={mobile.srcSet ? mobile.sizes : undefined}
        />
      )}
      {/* getImageProps gives the alt; the linter cannot see it through the spread. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img
        {...main}
        // An image that failed before hydration never reports it: check once mounted.
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailed(image)
        }}
        onError={() => setFailed(image)}
        className={cn(
          'transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.02]',
          fit === 'contain' ? 'object-contain' : 'object-cover',
        )}
      />
    </picture>
  )
}
