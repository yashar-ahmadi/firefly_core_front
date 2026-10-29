'use client'

import { ExternalLink, Play } from 'lucide-react'
import { useEffect, useRef, useState, type Ref } from 'react'
import { cn } from '@/components/ui/cn'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { SmartImage } from '@/components/ui/smart-image'
import { PLAYER_ALLOW, PLAYER_SANDBOX, videoEmbedUrl } from '@/features/linker/video-embed'

// A page's `video` block player (content digest §2: `video_url` is the https page of a video the
// operator copied, Aparat or YouTube; making it a player is the storefront's job). Nothing of the
// provider loads until the visitor asks: a cover and a play button stand in for the player.

export interface VideoPlayerProps {
  /** The operator's `video_url`. */
  url: string
  /** The block's cover picture, or null (the brand's gradient). Decorative: the button names it. */
  cover: string | null
  /** Names the player and its button («پخش ویدیو: …»). */
  title: string
  /** Style 4: the button opens the player in a dialog instead of in place. */
  inDialog?: boolean
  className?: string
}

/**
 * The provider's embed URL to start playing at once: YouTube's takes `autoplay=1`; Aparat's
 * frame is left as Aparat's own embed code writes it.
 */
function playingUrl(embed: string): string {
  return embed.includes('youtube-nocookie.com') ? `${embed}?autoplay=1&rel=0` : embed
}

/** The 16:9 player: the provider's iframe, sandboxed as the linker's. */
function Frame({ src, title, ref }: { src: string; title: string; ref?: Ref<HTMLIFrameElement> }) {
  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      sandbox={PLAYER_SANDBOX}
      allow={PLAYER_ALLOW}
      allowFullScreen
      // YouTube refuses to play without the page's origin as the referrer (its error 153).
      referrerPolicy="strict-origin-when-cross-origin"
      className="absolute inset-0 size-full border-0"
    />
  )
}

/** The cover and the round play mark over it (decorative: the button names itself). */
function Cover({ cover, external }: { cover: string | null; external: boolean }) {
  return (
    <>
      {cover ? (
        <SmartImage
          src={cover}
          alt=""
          fill
          sizes="(min-width: 1024px) 900px, 100vw"
          className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.02]"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 bg-linear-to-br from-brand-700 via-brand-900 to-ink-950"
        />
      )}
      <span
        aria-hidden
        className="absolute inset-0 bg-ink-950/25 transition-colors group-hover:bg-ink-950/35"
      />
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-brand-700 shadow-raised transition-transform motion-safe:group-hover:scale-110 md:size-20"
      >
        {external ? (
          <ExternalLink className="size-7" />
        ) : (
          <Play className="ms-1 size-8 fill-current" />
        )}
      </span>
    </>
  )
}

const FRAME =
  'group relative isolate block aspect-video w-full overflow-hidden rounded-card bg-ink-900 shadow-card'

/**
 * The cover with a play button; pressed, the Aparat or YouTube player takes its place (or opens
 * in a dialog, `inDialog`) and starts. A video on another site cannot be embedded: the cover is
 * then a link to it, in a new tab.
 */
export function VideoPlayer({ url, cover, title, inDialog = false, className }: VideoPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const embed = videoEmbedUrl(url)
  // The pressed button is gone: the focus moves to the player that replaced it.
  useEffect(() => {
    if (playing) frameRef.current?.focus()
  }, [playing])
  const label = `پخش ویدیو: ${title}`

  if (embed === null) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener"
        aria-label={`تماشای ویدیو در سایت سازنده: ${title}`}
        className={cn(FRAME, className)}
      >
        <Cover cover={cover} external />
      </a>
    )
  }

  if (inDialog) {
    return (
      <Dialog>
        <DialogTrigger aria-label={label} className={cn(FRAME, 'cursor-pointer', className)}>
          <Cover cover={cover} external={false} />
        </DialogTrigger>
        <DialogContent title={title} className="max-w-4xl">
          <div className="relative aspect-video w-full overflow-hidden rounded-control bg-ink-950">
            <Frame src={playingUrl(embed)} title={title} />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (playing) {
    return (
      <div className={cn(FRAME, className)}>
        <Frame ref={frameRef} src={playingUrl(embed)} title={title} />
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setPlaying(true)}
      className={cn(FRAME, 'cursor-pointer', className)}
    >
      <Cover cover={cover} external={false} />
    </button>
  )
}
