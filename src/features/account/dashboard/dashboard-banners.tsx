import { Carousel } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { PromoTile } from '@/features/home/promo-tile'
import type { HomeItem } from '@/lib/api/types/catalog'
import type { DashboardBanner } from '@/lib/api/types/dashboard'
import { BANNER_RATIO } from './banner-frame'

const LABEL = 'پیشنهادهای ویژه'

/** Rotates every 6 s (paused on hover, focus and touch; never under reduced motion). */
const AUTOPLAY_MS = 6000

/**
 * `BANNER_RATIO`: 2:1 on phones (the mobile picture), 4:1 from md. Pictures are cropped to fill
 * the frame, so operators should upload about 1600×400 and 800×400 (or keep text away from the
 * edges).
 */
const FRAME = cn(BANNER_RATIO, 'bg-linear-to-l from-brand-700 to-brand-500')

/** The account column: the page less the gutters, less the side column from lg. */
const SIZES =
  '(min-width: 1440px) 1080px, (min-width: 1024px) calc(100vw - 23.5rem), calc(100vw - 2rem)'

/** A dashboard banner as the homepage's promo tile reads it (`link` and `button_label` as is). */
function promoItem(banner: DashboardBanner): HomeItem {
  const url = banner.link.trim()
  return {
    id: banner.id,
    title: banner.title,
    description: banner.subtitle,
    image: banner.image,
    mobile_image: banner.mobile_image,
    text_color: '',
    alt: banner.alt,
    link: url ? { url, title: banner.button_label } : null,
  }
}

/**
 * The dashboard's promo banners (`getDashboardBanners`, read on the server and streamed in with
 * the page by `LiveBanners`) as a carousel of the homepage's promo tiles: the picture in a
 * fixed-ratio frame (the mobile picture on phones), the title, subtitle and button over it, the
 * whole tile a link to `link`. Nothing at all without a live banner.
 */
export function DashboardBanners({ banners }: { banners: DashboardBanner[] }) {
  const items = banners.filter((banner) => banner.image.trim() !== '').map(promoItem)
  if (items.length === 0) return null
  return (
    <Carousel ariaLabel={LABEL} loop={items.length > 1} autoplayMs={AUTOPLAY_MS} showDots>
      {items.map((item) => (
        <PromoTile
          key={item.id}
          item={item}
          size="tile"
          frameClassName={FRAME}
          sizes={SIZES}
          fallbackLabel={LABEL}
        />
      ))}
    </Carousel>
  )
}
