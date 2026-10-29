import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from '@/features/display/display-style'
import type { PageBlock } from '@/lib/api/types/page'
import { blockHeadingId, text } from './blocks'
import { VideoPlayer } from './video-player'

// The `video` block (content digest §2): its title, subtitle, `video_url` and cover (`image`),
// in one of four styles. Styles 2 to 4 draw the title themselves (BlockFrame `bare` for them).

export interface VideoBlockProps {
  block: PageBlock
  style: DisplayStyle
}

/** Whether the style draws the block's title itself, beside or over the player. */
export function videoDrawsTitle(style: DisplayStyle): boolean {
  return style !== 'style_1'
}

function Words({ block, tone }: { block: PageBlock; tone: 'ink' | 'light' }) {
  const title = text(block.title)
  const subtitle = text(block.subtitle)
  if (!title && !subtitle) return null
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <h2
          id={blockHeadingId(block)}
          className={cn(
            'text-xl leading-9 font-bold md:text-2xl md:leading-10',
            tone === 'light' ? 'text-white' : 'text-ink-900',
          )}
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p
          className={cn(
            'text-base leading-7 md:text-lg md:leading-8',
            tone === 'light' ? 'text-ink-100' : 'text-ink-600',
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}

/**
 * The video in one of four styles: 1. the player across the column under the block's header;
 * 2. the words beside the player (under it when narrow); 3. a dark cinema band, the words
 * centred over the player; 4. a compact card, its cover opening the player in a dialog.
 */
export function VideoBlock({ block, style }: VideoBlockProps) {
  const url = text(block.video_url)
  if (!url) return null
  const title = text(block.title) || 'ویدیو'
  const cover = text(block.image) || null
  const player = (inDialog = false, className?: string) => (
    <VideoPlayer url={url} cover={cover} title={title} inDialog={inDialog} className={className} />
  )

  if (style === 'style_2') {
    return (
      <div className="grid items-center gap-5 rounded-card bg-white p-4 shadow-card @3xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @3xl:gap-8 @3xl:p-6">
        <Words block={block} tone="ink" />
        {player()}
      </div>
    )
  }
  if (style === 'style_3') {
    return (
      <div className="flex flex-col items-center gap-6 rounded-card bg-linear-to-b from-ink-900 to-ink-950 px-4 py-8 text-center shadow-card md:px-8 md:py-12">
        <Words block={block} tone="light" />
        {player(false, 'max-w-4xl shadow-raised ring-1 ring-white/10')}
      </div>
    )
  }
  if (style === 'style_4') {
    return (
      <div className="flex flex-col gap-4 rounded-card bg-white p-3 shadow-card @xl:flex-row @xl:items-center @xl:gap-6">
        {player(true, '@xl:w-72 @xl:shrink-0 shadow-none')}
        <div className="px-1 pb-1 @xl:px-0">
          <Words block={block} tone="ink" />
        </div>
      </div>
    )
  }
  return player(false, 'mx-auto max-w-4xl')
}
