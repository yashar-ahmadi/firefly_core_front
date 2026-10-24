'use client'

import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { toPersianDigits } from '@/lib/format'
import { gutterClasses, type SlidesPerView } from './carousel-gutters'
import { cn } from './cn'
import { IconButton } from './icon-button'
import { usePrefersReducedMotion } from './use-media-query'

export type EmblaApi = NonNullable<UseEmblaCarouselType[1]>

export type { SlidesPerView }

export interface CarouselProps {
  /** One child per slide. */
  children: ReactNode
  /** Slides in view at once per breakpoint; a fraction such as 2.2 lets the next one peek in. */
  slidesPerView?: SlidesPerView
  loop?: boolean
  /**
   * Advances every `autoplayMs`. Pauses on hover, focus and touch, shows a pause button, and
   * never runs under prefers-reduced-motion.
   */
  autoplayMs?: number
  /** Names the carousel, e.g. «پیشنهادهای ویژه». */
  ariaLabel: string
  showArrows?: boolean
  showDots?: boolean
  /** Keeps the track 56px in from both sides wherever arrows show: they sit beside the cards. */
  arrowGutters?: boolean
  className?: string
}

/**
 * One value read from the Embla API; re-read whenever the selection or the layout changes.
 * `fallback` on the server and during hydration.
 */
export function useEmblaValue<T>(
  api: EmblaApi | undefined,
  read: (api: EmblaApi) => T,
  fallback: T,
): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!api) return () => {}
      api.on('select', onChange).on('reInit', onChange)
      return () => {
        api.off('select', onChange).off('reInit', onChange)
      }
    },
    [api],
  )
  return useSyncExternalStore(
    subscribe,
    () => (api ? read(api) : fallback),
    () => fallback,
  )
}

// Arrows overlay the edges from `sm` up. On phones they would cover slide content, so swiping,
// the peeking next slide and the dots do the job there. An arrow at the end of the track is
// `aria-disabled`, not `disabled`, so keyboard focus is never stranded on a dead button: it
// fades out, ignores pointers and presses, stays focusable, and shows dimmed while focused.
const ARROW = cn(
  'absolute top-1/2 z-10 -translate-y-1/2 border-ink-200 bg-white/95 shadow-raised max-sm:hidden',
  'aria-disabled:pointer-events-none aria-disabled:opacity-0 aria-disabled:focus-visible:opacity-50',
)

/**
 * A swipeable RTL carousel (Embla): slide 1 is on the right and «next» on the left. Pages by
 * what fits in view; arrows and dots appear only when there is something to scroll to.
 *
 * From `sm` up the 44px arrows overlay the slides 8–52px from each edge, so keep slide text and
 * buttons at least 56px (`px-14`) in from both inline edges when arrows show, or pass
 * `arrowGutters` to move the track out from under them.
 */
export function Carousel({
  children,
  slidesPerView = { base: 1 },
  loop = false,
  autoplayMs,
  ariaLabel,
  showArrows = true,
  showDots = false,
  arrowGutters = false,
  className,
}: CarouselProps) {
  const slides = Children.toArray(children)
  const [viewportRef, api] = useEmblaCarousel({
    direction: 'rtl',
    loop,
    align: 'start',
    slidesToScroll: 'auto',
  })
  const selected = useEmblaValue(api, (a) => a.selectedScrollSnap(), 0)
  const snapCount = useEmblaValue(api, (a) => a.scrollSnapList().length, 0)
  const canPrev = useEmblaValue(api, (a) => a.canScrollPrev(), false)
  const canNext = useEmblaValue(api, (a) => a.canScrollNext(), false)
  // Arrow and dot presses jump instead of gliding when the visitor asked for less motion.
  const reducedMotion = usePrefersReducedMotion()

  const [stopped, setStopped] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [touching, setTouching] = useState(false)
  const [focused, setFocused] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const autoplay = !!autoplayMs && autoplayMs > 0 && !reducedMotion && snapCount > 1
  const running = autoplay && !stopped && !hovered && !touching && !focused

  // One timeout per selected slide, so a manual move restarts the wait.
  useEffect(() => {
    if (!running || !api) return
    const timer = setTimeout(() => {
      if (api.canScrollNext()) api.scrollNext()
      else api.scrollTo(0)
    }, autoplayMs)
    return () => clearTimeout(timer)
  }, [running, api, autoplayMs, selected])

  const perView: CSSProperties = {
    ['--slide-basis' as string]: `${100 / slidesPerView.base}%`,
    ['--slide-basis-md' as string]: `${100 / (slidesPerView.md ?? slidesPerView.base)}%`,
    ['--slide-basis-lg' as string]: `${100 / (slidesPerView.lg ?? slidesPerView.md ?? slidesPerView.base)}%`,
  }
  const count = toPersianDigits(slides.length)
  const dots = showDots && snapCount > 1
  // Reserved from the first (server) render, before Embla measures, so the page never jumps
  // when the dots or the pause button appear.
  const controlsRow = slides.length > 1 && (showDots || (!!autoplayMs && autoplayMs > 0))

  return (
    <section
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      dir="rtl"
      className={cn('relative w-full min-w-0', className)}
      style={perView}
      onPointerEnter={(event) => event.pointerType !== 'touch' && setHovered(true)}
      onPointerLeave={(event) => event.pointerType !== 'touch' && setHovered(false)}
      onPointerDown={(event) => event.pointerType === 'touch' && setTouching(true)}
      onPointerUp={() => setTouching(false)}
      onPointerCancel={() => setTouching(false)}
      // Focus pauses rotation, except on the pause button itself (so «play» can resume it).
      onFocus={(event) => setFocused(event.target !== toggleRef.current)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <div className="relative">
        {/* Inline-size containment: the long slide track never widens a grid or flex parent. */}
        <div
          ref={viewportRef}
          data-carousel-viewport=""
          className={cn(
            'overflow-hidden [contain:inline-size]',
            arrowGutters && showArrows && gutterClasses(slides.length, slidesPerView),
          )}
        >
          <div className="-ms-3 flex touch-pan-y touch-pinch-zoom sm:-ms-4">
            {/* Each slide is a one-cell grid, so its content stretches to the tallest slide. The
                cell never grows past the slide (minmax(0, 1fr)): wide content inside a card (a
                button's label) cannot widen one card over its neighbours and the gap. */}
            {slides.map((slide, index) => (
              <div
                key={isValidElement(slide) && slide.key !== null ? slide.key : index}
                role="group"
                aria-roledescription="slide"
                aria-label={`${toPersianDigits(index + 1)} از ${count}`}
                className="grid min-w-0 shrink-0 grow-0 basis-(--slide-basis) grid-cols-[minmax(0,1fr)] ps-3 sm:ps-4 md:basis-(--slide-basis-md) lg:basis-(--slide-basis-lg)"
              >
                {slide}
              </div>
            ))}
          </div>
        </div>
        {showArrows && (canPrev || canNext) && (
          <>
            <IconButton
              label="اسلاید قبلی"
              icon={<ChevronRight />}
              variant="outline"
              aria-disabled={!canPrev || undefined}
              onClick={() => canPrev && api?.scrollPrev(reducedMotion)}
              className={cn(ARROW, 'start-2')}
            />
            <IconButton
              label="اسلاید بعدی"
              icon={<ChevronLeft />}
              variant="outline"
              aria-disabled={!canNext || undefined}
              onClick={() => canNext && api?.scrollNext(reducedMotion)}
              className={cn(ARROW, 'end-2')}
            />
          </>
        )}
      </div>

      {controlsRow && (
        <div
          className={cn(
            'mt-2 flex min-h-11 items-center justify-center gap-2',
            // Under reduced motion autoplay never runs: a row only for its pause button is empty.
            !showDots && 'motion-reduce:hidden',
          )}
        >
          {autoplay && (
            <IconButton
              ref={toggleRef}
              label={stopped ? 'ادامه نمایش خودکار' : 'توقف نمایش خودکار'}
              icon={stopped ? <Play /> : <Pause />}
              variant="ghost"
              size="sm"
              onClick={() => setStopped((value) => !value)}
              className="motion-reduce:hidden"
            />
          )}
          {dots && (
            <div role="group" aria-label="انتخاب اسلاید" className="flex flex-wrap justify-center">
              {Array.from({ length: snapCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`اسلاید ${toPersianDigits(index + 1)}`}
                  aria-current={index === selected ? 'true' : undefined}
                  onClick={() => api?.scrollTo(index, reducedMotion)}
                  className="group grid h-11 w-11 cursor-pointer place-items-center rounded-full"
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-ink-300 transition-[width,background-color] duration-200 group-hover:bg-ink-400 group-aria-[current=true]:w-7 group-aria-[current=true]:bg-brand" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
