'use client'

import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useEmblaValue } from '@/components/ui/carousel'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { SmartImage } from '@/components/ui/smart-image'
import { usePrefersReducedMotion } from '@/components/ui/use-media-query'
import { toPersianDigits } from '@/lib/format'
import type { GallerySlide } from './product-gallery'

export interface GalleryLightboxProps {
  /** The product's name: the dialog's title. */
  title: string
  slides: readonly GallerySlide[]
  /** The image pressed. */
  startIndex: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** At the ends the arrows stay focusable but inert (aria-disabled), so focus is never lost. */
const ARROW = 'aria-disabled:opacity-40'

/**
 * The pictures at their natural size, at most 500px (the API's crops: nothing to zoom into),
 * smaller on a short screen. A modal dialog: focus stays inside and goes back to the pressed
 * image on close; Escape closes. Swipe, the arrow keys (left is next in RTL) and the buttons
 * page through; the counter says where you are. Loaded only when first opened.
 */
export function GalleryLightbox({
  title,
  slides,
  startIndex,
  open,
  onOpenChange,
}: GalleryLightboxProps) {
  const [viewportRef, api] = useEmblaCarousel({ direction: 'rtl', startIndex })
  const selected = useEmblaValue(api, (embla) => embla.selectedScrollSnap(), startIndex)
  const canPrev = useEmblaValue(api, (embla) => embla.canScrollPrev(), false)
  const canNext = useEmblaValue(api, (embla) => embla.canScrollNext(), false)
  const reducedMotion = usePrefersReducedMotion()
  const count = slides.length

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') api?.scrollNext(reducedMotion)
    else if (event.key === 'ArrowRight') api?.scrollPrev(reducedMotion)
    else return
    event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} size="lg" onKeyDown={onKeyDown}>
        <div ref={viewportRef} dir="rtl" className="overflow-hidden">
          <div className="flex touch-pan-y touch-pinch-zoom">
            {slides.map((slide, index) => (
              <div
                key={`${index}-${slide.src}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${toPersianDigits(index + 1)} از ${toPersianDigits(count)}`}
                className="min-w-0 shrink-0 grow-0 basis-full"
              >
                <div
                  data-lightbox-frame=""
                  className="mx-auto w-[min(100%,calc(100dvh-13rem))] max-w-[500px]"
                >
                  <SmartImage
                    src={slide.src}
                    alt={slide.alt}
                    ratio="1/1"
                    sizes="500px"
                    loading={index === startIndex ? 'eager' : 'lazy'}
                    className="rounded-control bg-ink-50"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {count > 1 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <IconButton
              label="تصویر قبلی"
              icon={<ChevronRight />}
              variant="outline"
              aria-disabled={!canPrev || undefined}
              onClick={() => canPrev && api?.scrollPrev(reducedMotion)}
              className={ARROW}
            />
            <p aria-live="polite" className="text-base text-ink-700 tabular-nums">
              {`${toPersianDigits(selected + 1)} از ${toPersianDigits(count)}`}
            </p>
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
