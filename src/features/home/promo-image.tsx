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
 * `<source media="(max-width: 767px)">` serves the mobile image, optimised like next/image.
 * Fitted whole (`contain`), it lies on a blurred copy of itself that fills the frame, so a
 * picture of another ratio than its frame never sits on a bare band. If the picture cannot load
 * it is removed (with its copy), so the frame's own background shows instead of a broken-image
 * icon.
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

  const sources = mobile && (
    <source
      media={MOBILE_MEDIA}
      srcSet={mobile.srcSet ?? mobile.src}
      sizes={mobile.srcSet ? mobile.sizes : undefined}
    />
  )
  return (
    <>
      {/* `contain`: the same picture, blurred, fills the frame behind it instead of a bare band
          (one download: the same URL and candidates as the picture itself). Decorative: alt="". */}
      {fit === 'contain' && (
        <picture>
          {sources}
          <img
            {...main}
            alt=""
            // Never the LCP candidate: the picture over it is (the same URL, fetched once).
            loading="lazy"
            fetchPriority={undefined}
            className="scale-110 object-cover opacity-70 blur-2xl saturate-150"
          />
        </picture>
      )}
      <picture>
        {sources}
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
    </>
  )
}
