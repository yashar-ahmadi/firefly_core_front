import { onSiteOrigin } from '@/features/seo/breadcrumb-json-ld'
import type { ProductJsonLd } from '@/lib/api/types/catalog'

/**
 * The backend's Product JSON-LD with its URLs (`offers.url`, `image`) on `siteUrl`'s origin, like
 * the breadcrumb (the backend writes `https://<SITE_DOMAIN>`, seo digest §7.2; the storefront
 * serves `/media/` itself). Prices stay as the API wrote them: Rial, for search engines only.
 * A new object. Pure.
 */
export function siteProductJsonLd(data: ProductJsonLd, siteUrl: string): ProductJsonLd {
  const origin = new URL(siteUrl).origin
  return {
    ...data,
    image: onSiteOrigin(data.image, origin),
    offers: { ...data.offers, url: onSiteOrigin(data.offers.url, origin) },
  }
}
