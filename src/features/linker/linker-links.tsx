import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import type { LinkerLink } from '@/lib/api/types/linker'
import { formatIranMobile } from '@/lib/format/phone'
import { httpUrl } from '@/lib/html/safe-url'
import { asParsed, isRootPath } from '@/lib/links/as-parsed'
import { isBlogPostPath } from '@/lib/links/post-link'
import { isShortLinkPath } from '@/lib/links/short-link'
import { videoEmbedUrl } from './video-embed'

export type ThumbnailSide = 'right' | 'left'

/** A button in the theme's colours: its border, its fill, a hover mixed from both; 56px high. */
const BUTTON = cn(
  'flex min-h-14 w-full items-center gap-3 rounded-(--linker-radius) border-2 px-3 py-2',
  'border-(--linker-button-border) bg-(--linker-button-background) text-(--linker-button-text)',
  'text-base leading-7 font-medium transition-colors motion-reduce:transition-none',
  'hover:bg-[color-mix(in_srgb,var(--linker-button-text)_15%,var(--linker-button-background))]',
)

/** The thumbnail's physical side: `left` reverses the row (RTL). */
const buttonClass = (side: ThumbnailSide) => cn(BUTTON, side === 'left' && 'flex-row-reverse')

/**
 * A button's face: its title centred, its thumbnail on the PHYSICAL side the operator chose
 * (the page is RTL: `right` is the natural order, `left` reverses it), a same-sized spacer on the
 * other side so the title stays in the middle.
 */
function Face({ link, extra }: { link: LinkerLink; extra?: ReactNode }) {
  const thumbnail = link.thumbnail ? (
    <SmartImage
      src={link.thumbnail}
      alt=""
      width={40}
      height={40}
      className="size-10 shrink-0 rounded-(--linker-radius) object-cover"
    />
  ) : null
  return (
    <>
      {thumbnail}
      <span className="flex min-w-0 flex-1 flex-col items-center text-center">
        <span dir="auto">{link.title || link.value}</span>
        {extra}
      </span>
      {thumbnail && <span aria-hidden className="size-10 shrink-0" />}
    </>
  )
}

/**
 * A button or a video that is no embed (content digest §8): a store path is a shop link (the
 * router's `Link`, a post never prefetched: P5-R1; a short link a plain `<a>`, since each request
 * to it counts a visit), anything else a plain `<a>` to the API's absolute `href`.
 */
function buttonLink(link: LinkerLink, side: ThumbnailSide): ReactNode {
  const className = buttonClass(side)
  const face = <Face link={link} />
  // A store path (`/product/list/x/`) as the URL parser reads it: never `//host` or `/\host`, a
  // tab or a line break taken out (src/lib/links/as-parsed.ts).
  const path = asParsed(link.value)
  if (isRootPath(path)) {
    if (isShortLinkPath(path)) {
      return (
        <a href={path} className={className}>
          {face}
        </a>
      )
    }
    return (
      <Link href={path} prefetch={isBlogPostPath(path) ? false : undefined} className={className}>
        {face}
      </Link>
    )
  }
  const href = httpUrl(link.href)
  return href ? (
    <a href={href} className={className}>
      {face}
    </a>
  ) : null
}

/**
 * What a player may do (both need their scripts and their own origin's storage; fullscreen;
 * the provider's page in a new tab), nothing more: no top navigation, forms or downloads.
 */
const PLAYER_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups'

/** An Aparat or YouTube player, lazily loaded, sandboxed, in a 16:9 frame; the title under it. */
function VideoEmbed({ link, src }: { link: LinkerLink; src: string }) {
  const title = link.title.trim() || 'ویدیو'
  return (
    <figure className="w-full">
      <div className="aspect-video w-full overflow-hidden rounded-(--linker-radius) bg-black/20">
        <iframe
          src={src}
          title={title}
          loading="lazy"
          sandbox={PLAYER_SANDBOX}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          // YouTube refuses to play without the page's origin as the referrer (its error 153).
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full border-0"
        />
      </div>
      {link.title.trim() && (
        <figcaption className="mt-2 text-center text-sm leading-6">{link.title}</figcaption>
      )}
    </figure>
  )
}

/**
 * One link as its type says (content digest §8); null for a type the shop does not know, and for
 * a link whose address is not what its type needs (the API drops those already).
 */
function linkerItem(link: LinkerLink, side: ThumbnailSide): ReactNode {
  switch (link.link_type) {
    case 'button':
      return buttonLink(link, side)
    case 'video': {
      const embed = videoEmbedUrl(link.value)
      return embed ? <VideoEmbed link={link} src={embed} /> : buttonLink(link, side)
    }
    case 'email':
    case 'phone': {
      const scheme = link.link_type === 'email' ? 'mailto:' : 'tel:'
      if (!link.href.toLowerCase().startsWith(scheme)) return null
      const number =
        link.link_type === 'phone' ? (
          <span dir="ltr" className="text-sm leading-6 font-normal">
            {formatIranMobile(link.value)}
          </span>
        ) : undefined
      return (
        <a href={link.href} className={buttonClass(side)}>
          <Face link={link} extra={number} />
        </a>
      )
    }
    case 'text':
      return (
        <div className="w-full px-2 py-2 text-center">
          {link.title.trim() && (
            <h2 dir="auto" className="text-base leading-7 font-bold">
              {link.title}
            </h2>
          )}
          {/* Plain text, never HTML: React escapes it; its own line breaks are kept. */}
          <p dir="auto" className="mt-1 text-base leading-8 whitespace-pre-line">
            {link.value}
          </p>
        </div>
      )
    default:
      return null
  }
}

/** The links in the operator's order (already filtered by the API: never filtered again). */
export function LinkerLinks({
  links,
  side,
}: {
  links: readonly LinkerLink[]
  side: ThumbnailSide
}) {
  const items = links.flatMap((link) => {
    const node = linkerItem(link, side)
    return node === null ? [] : [<li key={link.id}>{node}</li>]
  })
  if (items.length === 0) return null
  return (
    <ul aria-label="پیوندها" className="flex w-full flex-col gap-3">
      {items}
    </ul>
  )
}
