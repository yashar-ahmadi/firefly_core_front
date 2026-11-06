'use client'

import dynamic from 'next/dynamic'

/**
 * Style 2's banner row (PromoBanners), its code (Embla, about 9 KB gzip) loaded only where one is
 * drawn. A server component's static import of the carousel, or its own `dynamic()` of it, puts
 * that code in every page whose tree may show banners (each category, through CategoryBanners),
 * with or without a carousel on it: over the catalog's JS budget (P2-R4) signed in. Split here, in
 * the browser's graph, it loads with the row that uses it; the row is still rendered on the server
 * and hydrates once its code has arrived.
 */
export const BannerCarousel = dynamic(() =>
  import('@/components/ui/carousel').then((mod) => mod.Carousel),
)
