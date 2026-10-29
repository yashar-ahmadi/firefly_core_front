'use client'

import useEmblaCarousel from 'embla-carousel-react'
import { Pause, Play } from 'lucide-react'
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { useEmblaValue } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { SmartImage } from '@/components/ui/smart-image'
import { usePrefersReducedMotion } from '@/components/ui/use-media-query'
import { toPersianDigits } from '@/lib/format'

/** One slide's thumbnail: its picture and the name it is chosen by. */
export interface SlideThumb {
  id: number
  image: string
  /** The slide's title, or "" (the button is then «اسلاید N»). */
  title: string
}

export interface ThumbnailSliderProps {
  /** One child per slide, in the order of `thumbs`. */
  children: ReactNode
  thumbs: readonly SlideThumb[]
  /** Names the slider. */
  ariaLabel: string
  /** Advances every `autoplayMs`, as Carousel's autoplay: paused on hover, focus and touch. */
  autoplayMs: number
}

/**
 * The slider's fourth style: one slide in view, and under it from md a row of thumbnails, the
 * selected one ringed with a bar that fills while its slide shows, so a shopper sees what the
 * other slides offer and jumps to one. Phones get dots instead. Autoplay pauses on hover, focus
 * and touch, has a pause button, and never runs under prefers-reduced-motion (nor does the bar).
 */
export function ThumbnailSlider({ children, thumbs, ariaLabel, autoplayMs }: ThumbnailSliderProps) {
  const slides = Children.toArray(children)
  const count = slides.length
  const [viewportRef, api] = useEmblaCarousel({ direction: 'rtl', loop: count > 1 })
  const selected = useEmblaValue(api, (a) => a.selectedScrollSnap(), 0)
  const reducedMotion = usePrefersReducedMotion()
  const [stopped, setStopped] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [touching, setTouching] = useState(false)
  const [focused, setFocused] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const autoplay = autoplayMs > 0 && !reducedMotion && count > 1
  const running = autoplay && !stopped && !hovered && !touching && !focused

  useEffect(() => {
    if (!running || !api) return
    const timer = setTimeout(() => api.scrollNext(), autoplayMs)
    return () => clearTimeout(timer)
  }, [running, api, autoplayMs, selected])

  const total = toPersianDigits(count)
  const go = (index: number) => api?.scrollTo(index, reducedMotion)

  return (
    <section
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      dir="rtl"
      className="relative w-full min-w-0"
      onPointerEnter={(event) => event.pointerType !== 'touch' && setHovered(true)}
      onPointerLeave={(event) => event.pointerType !== 'touch' && setHovered(false)}
      onPointerDown={(event) => event.pointerType === 'touch' && setTouching(true)}
      onPointerUp={() => setTouching(false)}
      onPointerCancel={() => setTouching(false)}
      onFocus={(event) => setFocused(event.target !== toggleRef.current)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <div ref={viewportRef} className="overflow-hidden rounded-card [contain:inline-size]">
        <div className="flex touch-pan-y touch-pinch-zoom">
          {slides.map((slide, index) => (
            <div
              key={isValidElement(slide) && slide.key !== null ? slide.key : index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${toPersianDigits(index + 1)} از ${total}`}
              className="grid min-w-0 shrink-0 grow-0 basis-full grid-cols-[minmax(0,1fr)]"
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-3 flex min-h-11 items-center gap-2">
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
          <div
            role="group"
            aria-label="انتخاب اسلاید"
            className="flex min-w-0 flex-1 justify-center md:justify-start"
          >
            {/* Phones: dots. */}
            <div className="flex flex-wrap justify-center md:hidden">
              {thumbs.map((thumb, index) => (
                <button
                  key={thumb.id}
                  type="button"
                  aria-label={`اسلاید ${toPersianDigits(index + 1)}`}
                  aria-current={index === selected ? 'true' : undefined}
                  onClick={() => go(index)}
                  className="group grid size-11 cursor-pointer place-items-center rounded-full"
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-ink-300 transition-[width,background-color] duration-200 group-aria-[current=true]:w-7 group-aria-[current=true]:bg-brand" />
                </button>
              ))}
            </div>
            {/* From md: the thumbnails, scrolling sideways when they outgrow the row. */}
            <div className="flex min-w-0 flex-1 [scrollbar-width:none] gap-3 overflow-x-auto p-1 max-md:hidden [&::-webkit-scrollbar]:hidden">
              {thumbs.map((thumb, index) => {
                const current = index === selected
                return (
                  <button
                    key={thumb.id}
                    type="button"
                    aria-label={thumb.title.trim() || `اسلاید ${toPersianDigits(index + 1)}`}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => go(index)}
                    className={cn(
                      'group relative flex w-44 shrink-0 cursor-pointer flex-col gap-1.5 overflow-hidden rounded-control bg-white p-1.5 text-start shadow-card ring-1 ring-ink-200 transition-[box-shadow,opacity] lg:w-52',
                      current
                        ? 'opacity-100 ring-2 ring-brand'
                        : 'opacity-75 hover:opacity-100 hover:ring-ink-300',
                    )}
                  >
                    <SmartImage
                      src={thumb.image}
                      alt=""
                      ratio="16/9"
                      sizes="208px"
                      className="rounded-[calc(var(--radius-control)-0.25rem)] bg-ink-100"
                    />
                    {thumb.title.trim() && (
                      <span className="line-clamp-1 px-0.5 text-sm leading-6 font-medium text-ink-800">
                        {thumb.title}
                      </span>
                    )}
                    {/* In step with the wait: a pause restarts both, so the bar shows only while
                        the slide is timed. */}
                    {current && running && (
                      <span
                        key={selected}
                        aria-hidden
                        style={{ animationDuration: `${autoplayMs}ms` }}
                        className="absolute inset-x-0 bottom-0 h-1 origin-right animate-slide-progress bg-brand"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
