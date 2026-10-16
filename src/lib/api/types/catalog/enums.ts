/** Shared catalog enums and JSON-LD shapes (product digest §4). Pure: safe in any bundle. */

/** The five listing sorts, in the order `/product/filters/` returns their labels. */
export const SORT_VALUES = ['date-desc', 'date-asc', 'price-desc', 'price-asc', 'sale'] as const

/** `date-desc` is the API default. A category or list page's `default_sorting` is not applied server-side. */
export type SortValue = (typeof SORT_VALUES)[number]

export function isSortValue(value: unknown): value is SortValue {
  return typeof value === 'string' && (SORT_VALUES as readonly string[]).includes(value)
}

/** `downloadable` and `virtual` have no delivery flow in the backend: treat them like `simple`. */
export type ProductType = 'simple' | 'variable' | 'downloadable' | 'virtual'

/** radio: text chip; pattern: image swatch; color: coloured circle; select: a `<select>`. */
export type InputType = 'radio' | 'pattern' | 'color' | 'select'

export type CommentType = 'comment' | 'question'

/** Shipping packaging; rarely shown. */
export type ProductContentType = 'general' | 'fragile_or_liquid' | 'documents'

/** Item URLs are on `https://<SITE_DOMAIN>`; position 1 is «خانه». */
export interface BreadcrumbListJsonLd {
  '@context': 'https://schema.org'
  '@type': 'BreadcrumbList'
  itemListElement: { '@type': 'ListItem'; position: number; name: string; item: string }[]
}

/** `https://schema.org/InStock` or `https://schema.org/OutOfStock`. */
type Availability = string

/** Prices are in **Rial** (Toman × 10), as strings: never display them. */
export type ProductJsonLdOffer =
  | {
      '@type': 'Offer'
      url: string
      priceCurrency: 'IRR'
      /** "0" when the product has no variants. */
      price: string
      availability: Availability
    }
  | {
      '@type': 'AggregateOffer'
      url: string
      priceCurrency: 'IRR'
      lowPrice: string
      highPrice: string
      offerCount: number
      availability: Availability
    }

export interface ProductJsonLd {
  '@context': 'https://schema.org/'
  '@type': 'Product'
  name: string
  /** On `https://<SITE_DOMAIN>/media/...`, not the API host. */
  image: string
  /** Equals `page_description`; may be "". */
  description: string
  sku: string
  mpn: string
  offers: ProductJsonLdOffer
  /** The product brand, else the site name. */
  brand?: { '@type': 'Brand'; name: string }
  /** Up to 5 root reviews; no `reviewRating`, and no `aggregateRating` anywhere. */
  review?: {
    '@type': 'Review'
    author: { '@type': 'Person'; name: string }
    /** YYYY-MM-DD. */
    datePublished: string
    reviewBody: string
  }[]
}
