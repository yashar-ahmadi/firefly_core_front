import { cn } from './cn'

/** Slides in view at once per breakpoint (Carousel's `slidesPerView`). */
export interface SlidesPerView {
  base: number
  md?: number
  lg?: number
}

/**
 * The track's margins for Carousel's `arrowGutters`: `mx-14` (56px, clear of the 44px arrows 8px
 * from the edges) from `sm` up, at each breakpoint where the slides overflow, since the arrows
 * show only there. Literal classes, so Tailwind sees them. Pure.
 */
export function gutterClasses(count: number, perView: SlidesPerView): string {
  const md = perView.md ?? perView.base
  const lg = perView.lg ?? md
  return cn(
    count > perView.base && 'sm:mx-14',
    count > md ? 'md:mx-14' : 'md:mx-0',
    count > lg ? 'lg:mx-14' : 'lg:mx-0',
  )
}
