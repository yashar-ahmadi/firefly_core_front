'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'
import { cn } from './cn'

/** Shown when there is no image or it fails to load (public/images/placeholder.svg). */
export const PLACEHOLDER_SRC = '/images/placeholder.svg'

/** The only paths the Firefly API serves files from (next.config `remotePatterns`). */
const MEDIA_PATH = /^\/(?:media|static)\//
/**
 * Hosts the Next.js optimizer refuses to fetch from (it blocks private addresses unless
 * `images.dangerouslyAllowLocalIP`), e.g. the dev API on localhost:8000.
 */
const PRIVATE_HOST =
  /^(?:localhost|.+\.localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|0\.0\.0\.0|\[::1?\])$/

/**
 * Whether next/image may optimize `src`: same-origin paths, and media files on the API's
 * public origin. Anything else (other hosts, data/blob URLs) is rendered `unoptimized`, since
 * the build-time allow-list would reject it.
 */
export function isOptimizable(src: string, mediaOrigin?: string): boolean {
  if (src.startsWith('/')) return !src.startsWith('//') && !src.startsWith('/\\')
  if (!mediaOrigin) return false
  try {
    const url = new URL(src)
    return (
      url.origin === new URL(mediaOrigin).origin &&
      MEDIA_PATH.test(url.pathname) &&
      !PRIVATE_HOST.test(url.hostname)
    )
  } catch {
    return false
  }
}

export interface SmartImageProps extends Omit<ImageProps, 'src' | 'alt'> {
  src: string | null | undefined
  alt: string
  /**
   * CSS aspect ratio such as `"1/1"` (every product image is square). The image then fills a
   * frame with that ratio and `className` styles the frame.
   */
  ratio?: string
  /** The API's public origin (PublicStoreConfig.mediaOrigin); media there is optimized. */
  mediaOrigin?: string
  fit?: 'cover' | 'contain'
  /** Classes for the `<img>` when `ratio` is set. */
  imgClassName?: string
}

/** next/image with a placeholder fallback, an optional ratio frame and safe optimization. */
export function SmartImage({
  src,
  alt,
  ratio,
  mediaOrigin,
  fit = 'cover',
  className,
  imgClassName,
  unoptimized,
  onError,
  ...props
}: SmartImageProps) {
  // Remember which source failed, so a new `src` is tried again without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const shown = src && src !== failedSrc ? src : PLACEHOLDER_SRC
  const image = (extra: Partial<ImageProps>, imageClass?: string) => (
    <Image
      {...props}
      {...extra}
      src={shown}
      alt={alt}
      unoptimized={unoptimized || shown === PLACEHOLDER_SRC || !isOptimizable(shown, mediaOrigin)}
      onError={(event) => {
        if (src) setFailedSrc(src)
        onError?.(event)
      }}
      className={imageClass}
    />
  )

  if (!ratio) return image({}, className)
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{
        aspectRatio: ratio
          .split('/')
          .map((part) => part.trim())
          .join(' / '),
      }}
    >
      {image(
        { fill: true, sizes: props.sizes ?? '100vw' },
        cn(fit === 'contain' ? 'object-contain' : 'object-cover', imgClassName),
      )}
    </div>
  )
}
