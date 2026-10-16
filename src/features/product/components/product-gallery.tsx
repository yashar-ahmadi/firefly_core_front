'use client'

import useEmblaCarousel from 'embla-carousel-react'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useEmblaValue } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { usePrefersReducedMotion } from '@/components/ui/use-media-query'
import type { Variant } from '@/lib/api/types/catalog'
import { toPersianDigits } from '@/lib/format'
import type { ClientProduct } from '../client-product'
import { useProduct } from './product-provider'

// The lightbox's code loads the first time it opens (or when the pointer comes near).
const GalleryLightbox = dynamic(
  () => import('./gallery-lightbox').then((module) => module.GalleryLightbox),
  { ssr: false },
)
const preloadLightbox = () => void import('./gallery-lightbox')

export interface GallerySlide {
  src: string
  alt: string
}

/**
 * The gallery (product digest §5.8): the variant's image (else the product's), named by the
 * product, then the gallery images with their own alt text (never empty).
 */
export function gallerySlides(
  product: Pick<ClientProduct, 'image' | 'name' | 'gallery'>,
  variant: Variant | null,
): GallerySlide[] {
  return [
    { src: variant?.image ?? product.image, alt: product.name },
    ...product.gallery.map((item) => ({ src: item.image, alt: item.alt })),
  ]
}

/** Square images: the full width on phones, half the page on tablets, 500px (natural) above. */
const MAIN_SIZES = '(min-width: 1024px) 500px, (min-width: 768px) 50vw, 100vw'

const counter = (index: number, count: number) =>
  `${toPersianDigits(index + 1)} از ${toPersianDigits(count)}`

/**
 * The product's pictures, all square. One swipeable track (Embla, RTL) on every screen: dots
 * under it on phones, a thumbnail rail from md. The first image is the page's LCP image (eager,
 * high priority); choosing a variant shows its image there and goes back to it. Pressing an
 * image opens the lightbox at that image.
 */
export function ProductGallery() {
  const { product, variant } = useProduct()
  const slides = gallerySlides(product, variant)
  const [viewportRef, api] = useEmblaCarousel({ direction: 'rtl', align: 'start' })
  const selected = useEmblaValue(api, (embla) => embla.selectedScrollSnap(), 0)
  const reducedMotion = usePrefersReducedMotion()
  const [lightbox, setLightbox] = useState({ mounted: false, open: false, index: 0 })
  const mainSrc = slides[0]?.src

  // Another variant's image: back to the first slide, where it is.
  useEffect(() => {
    api?.scrollTo(0, true)
  }, [api, mainSrc])

  const go = (index: number) => api?.scrollTo(index, reducedMotion)
  const several = slides.length > 1

  return (
    <div className="flex flex-col gap-3" onPointerEnter={preloadLightbox}>
      <section
        aria-roledescription="carousel"
        aria-label="تصاویر محصول"
        dir="rtl"
        className="-mx-4 md:mx-0"
      >
        <div
          ref={viewportRef}
          className="overflow-hidden bg-white [contain:inline-size] md:rounded-card"
        >
          <div className="flex touch-pan-y touch-pinch-zoom">
            {slides.map((slide, index) => (
              <div
                key={`${index}-${slide.src}`}
                role="group"
                aria-roledescription="slide"
                aria-label={counter(index, slides.length)}
                className="min-w-0 shrink-0 grow-0 basis-full"
              >
                <button
                  type="button"
                  aria-label={`نمایش بزرگ تصویر ${toPersianDigits(index + 1)}`}
                  onFocus={preloadLightbox}
                  onClick={() => setLightbox({ mounted: true, open: true, index })}
                  className="block w-full cursor-zoom-in focus-visible:-outline-offset-2"
                >
                  <SmartImage
                    src={slide.src}
                    alt={slide.alt}
                    ratio="1/1"
                    sizes={MAIN_SIZES}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : undefined}
                    className="mx-auto w-full max-w-[500px]"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {several && (
        // Eight images or more wrap onto a second row: each dot keeps its 44px target.
        <div
          role="group"
          aria-label="انتخاب تصویر"
          className="flex flex-wrap justify-center md:hidden"
        >
          {slides.map((slide, index) => (
            <button
              key={`${index}-${slide.src}`}
              type="button"
              aria-label={`تصویر ${toPersianDigits(index + 1)}`}
              aria-current={index === selected ? 'true' : undefined}
              onClick={() => go(index)}
              className="group grid size-11 shrink-0 place-items-center rounded-full"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-ink-300 transition-[width,background-color] duration-200 group-aria-[current=true]:w-7 group-aria-[current=true]:bg-brand" />
            </button>
          ))}
        </div>
      )}

      {several && (
        <div
          role="group"
          aria-label="تصاویر کوچک"
          className="hidden [scrollbar-width:thin] gap-2 overflow-x-auto p-0.5 md:flex"
        >
          {slides.map((slide, index) => (
            <button
              key={`${index}-${slide.src}`}
              type="button"
              aria-label={`تصویر ${toPersianDigits(index + 1)}`}
              aria-current={index === selected ? 'true' : undefined}
              onClick={() => go(index)}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-control border-2 bg-white transition-colors',
                index === selected ? 'border-brand' : 'border-ink-200 hover:border-ink-400',
              )}
            >
              <SmartImage src={slide.src} alt="" ratio="1/1" sizes="64px" />
            </button>
          ))}
        </div>
      )}

      {lightbox.mounted && (
        <GalleryLightbox
          title={product.name}
          slides={slides}
          startIndex={lightbox.index}
          open={lightbox.open}
          onOpenChange={(open) => setLightbox((current) => ({ ...current, open }))}
        />
      )}
    </div>
  )
}
