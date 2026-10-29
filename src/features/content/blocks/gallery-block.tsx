'use client'

import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Carousel, useEmblaValue } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { SmartImage } from '@/components/ui/smart-image'
import { usePrefersReducedMotion } from '@/components/ui/use-media-query'
import type { DisplayStyle } from '@/features/display/display-style'
import { toPersianDigits } from '@/lib/format'

// The `gallery` block (content digest §2): pictures with their alt text and caption (`title`), in
// one of four styles; pressing one opens them all in a viewer.

/** One picture of the gallery. */
export interface GalleryPicture {
  id: number
  image: string
  alt: string
  /** "" for none. */
  caption: string
}

export interface GalleryBlockProps {
  pictures: GalleryPicture[]
  style: DisplayStyle
  /** The gallery's name: the viewer's title and the carousel's. */
  label: string
}

/** Style 2's tiles take these shapes in turn, so the columns fall unevenly, as a wall of photos. */
const WALL_RATIOS = ['3/4', '1/1', '4/3', '1/1', '3/4', '4/3'] as const

/** What a picture's button is called: its alt text, else its caption, else «تصویر N». */
function nameOf(picture: GalleryPicture, index: number): string {
  return picture.alt.trim() || picture.caption.trim() || `تصویر ${toPersianDigits(index + 1)}`
}

/** At the ends the arrows stay focusable but inert (aria-disabled), so focus is never lost. */
const ARROW = 'aria-disabled:opacity-40'

/**
 * The pictures whole (never cropped) as large as the screen allows, their captions under them:
 * a modal dialog, opened at the picture pressed; swipe, the arrow keys (left is next in RTL)
 * and the buttons page through, the counter says where you are. Escape closes it and the focus
 * goes back to the picture.
 */
function Viewer({
  pictures,
  startIndex,
  label,
  open,
  onOpenChange,
}: {
  pictures: GalleryPicture[]
  startIndex: number
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [viewportRef, api] = useEmblaCarousel({ direction: 'rtl', startIndex })
  const selected = useEmblaValue(api, (embla) => embla.selectedScrollSnap(), startIndex)
  const canPrev = useEmblaValue(api, (embla) => embla.canScrollPrev(), false)
  const canNext = useEmblaValue(api, (embla) => embla.canScrollNext(), false)
  const reducedMotion = usePrefersReducedMotion()
  const count = toPersianDigits(pictures.length)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') api?.scrollNext(reducedMotion)
    else if (event.key === 'ArrowRight') api?.scrollPrev(reducedMotion)
    else return
    event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={label} className="max-w-5xl" onKeyDown={onKeyDown}>
        <div ref={viewportRef} dir="rtl" className="overflow-hidden">
          <div className="flex touch-pan-y touch-pinch-zoom">
            {pictures.map((picture, index) => (
              <figure
                key={picture.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${toPersianDigits(index + 1)} از ${count}`}
                className="flex min-w-0 shrink-0 grow-0 basis-full flex-col items-center gap-2"
              >
                <div className="relative h-[min(65dvh,40rem)] w-full">
                  <SmartImage
                    src={picture.image}
                    alt={picture.alt}
                    fill
                    sizes="(min-width: 1024px) 960px, 100vw"
                    loading={index === startIndex ? 'eager' : 'lazy'}
                    className="object-contain"
                  />
                </div>
                {picture.caption.trim() && (
                  <figcaption className="text-center text-base leading-7 text-ink-700">
                    {picture.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
        {pictures.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <IconButton
              label="تصویر قبلی"
              icon={<ChevronRight />}
              variant="outline"
              aria-disabled={!canPrev || undefined}
              onClick={() => canPrev && api?.scrollPrev(reducedMotion)}
              className={ARROW}
            />
            <span
              aria-live="polite"
              className="min-w-16 text-center text-sm text-ink-600 tabular-nums"
            >
              {`${toPersianDigits(selected + 1)} از ${count}`}
            </span>
            <IconButton
              label="تصویر بعدی"
              icon={<ChevronLeft />}
              variant="outline"
              aria-disabled={!canNext || undefined}
              onClick={() => canNext && api?.scrollNext(reducedMotion)}
              className={ARROW}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A picture as a button that opens the viewer, its caption under it. */
function Tile({
  picture,
  index,
  ratio,
  sizes,
  onOpen,
}: {
  picture: GalleryPicture
  index: number
  /** The tile's CSS aspect ratio («4/3»). */
  ratio: string
  sizes: string
  onOpen: (index: number) => void
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        aria-label={`نمایش بزرگ ${nameOf(picture, index)}`}
        onClick={() => onOpen(index)}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-card bg-ink-100 shadow-card"
        style={{ aspectRatio: ratio.replace('/', ' / ') }}
      >
        <SmartImage
          src={picture.image}
          alt=""
          fill
          sizes={sizes}
          loading="lazy"
          className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
        />
        <span
          aria-hidden
          className="absolute end-2 top-2 grid size-9 place-items-center rounded-full bg-white/90 text-ink-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [&_svg]:size-4"
        >
          <Expand />
        </span>
      </button>
      {picture.caption.trim() && (
        <figcaption className="line-clamp-2 px-0.5 text-sm leading-6 text-ink-600">
          {picture.caption}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * The pictures in one of four styles: 1. an even grid of 4:3 tiles; 2. a wall of photos, their
 * shapes taking turns in flowing columns; 3. a carousel; 4. the first picture large beside the
 * others (squares). Every picture opens the viewer; a viewer is mounted only once opened.
 */
export function GalleryBlock({ pictures, style, label }: GalleryBlockProps) {
  const [opened, setOpened] = useState<number | null>(null)
  const open = (index: number) => setOpened(index)

  let body
  if (style === 'style_2') {
    body = (
      <ul className="columns-2 gap-3 @2xl:columns-3 @5xl:columns-4">
        {pictures.map((picture, index) => (
          <li key={picture.id} className="mb-3 break-inside-avoid">
            <Tile
              picture={picture}
              index={index}
              ratio={WALL_RATIOS[index % WALL_RATIOS.length]!}
              sizes="(min-width: 1024px) 25vw, 50vw"
              onOpen={open}
            />
          </li>
        ))}
      </ul>
    )
  } else if (style === 'style_3') {
    body = (
      <Carousel ariaLabel={label} slidesPerView={{ base: 1.2, md: 2.2, lg: 3 }} arrowGutters>
        {pictures.map((picture, index) => (
          <Tile
            key={picture.id}
            picture={picture}
            index={index}
            ratio="4/3"
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 45vw, 80vw"
            onOpen={open}
          />
        ))}
      </Carousel>
    )
  } else if (style === 'style_4' && pictures.length > 2) {
    body = (
      <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {pictures.map((picture, index) => (
          <li
            key={picture.id}
            className={cn('grid min-w-0', index === 0 && 'col-span-2 @2xl:row-span-2')}
          >
            <Tile
              picture={picture}
              index={index}
              // Squares throughout: the first, two columns wide and two rows high, is one too.
              ratio="1/1"
              sizes={
                index === 0 ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, 50vw'
              }
              onOpen={open}
            />
          </li>
        ))}
      </ul>
    )
  } else {
    body = (
      <ul
        className={cn(
          'grid gap-3',
          pictures.length === 1 ? 'grid-cols-1' : 'grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4',
        )}
      >
        {pictures.map((picture, index) => (
          <li key={picture.id} className="min-w-0">
            <Tile
              picture={picture}
              index={index}
              ratio={pictures.length === 1 ? '16/9' : '4/3'}
              sizes="(min-width: 1024px) 33vw, 50vw"
              onOpen={open}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      {body}
      {opened !== null && (
        <Viewer
          pictures={pictures}
          startIndex={opened}
          label={label}
          open
          onOpenChange={(next) => {
            if (!next) setOpened(null)
          }}
        />
      )}
    </>
  )
}
