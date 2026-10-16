/**
 * Product cards and the product page payload (product digest §3.8, §3.10, §3.15). Pure types.
 * Money is integer Toman; dates are ISO-8601 with an offset; images are absolute URLs.
 */
import type {
  BreadcrumbListJsonLd,
  ProductContentType,
  ProductJsonLd,
  ProductType,
} from '@/lib/api/types/catalog/enums'
import type {
  CatalogSeo,
  CategoryBreadcrumbNode,
  CategoryLight,
  ConsiderBeforeBuying,
  QuestionAnswer,
} from '@/lib/api/types/catalog/taxonomy'
import type { Variant, VariantOption } from '@/lib/api/types/catalog/variant'

export interface Badge {
  id: number
  name: string
  /** #HEX background. */
  badge_color: string
  /** #HEX. */
  text_color: string
}

export interface BrandLight {
  id: number
  name: string
  slug: string
  image: string
}

/** A label of the representative variant, e.g. `{ attribute_name: 'رنگ', name: 'مشکی' }`. */
export interface VariantAttributeLabel {
  attribute_name: string
  name: string
}

/**
 * One result of `GET product/list/` (also homepage carousels, search and related products).
 * Prices and limits are the representative variant's. Cards carry no variants.
 */
export interface ProductCard {
  /** Internal id; show `product_code` on the product page instead. */
  id: number
  name: string
  slug: string
  /** Subtitle line. */
  extra_detail: string | null
  /** 500×500; never null (placeholder when unset). */
  image: string
  type: ProductType
  badge: Badge | null
  brand: BrandLight | null
  /** Direct categories, drafts included: never build links from these. */
  categories: CategoryLight[]
  /** At least one variant is purchasable right now. */
  in_stock: boolean
  is_special_product: boolean
  /** A bundle. */
  is_collection: boolean
  /** Display-only wholesale flag. */
  enable_major: boolean
  /** 0..5 with one decimal; 0 means no ratings yet. */
  rating: number
  rating_count: number
  /** null: the product has no variants, so buying is disabled. */
  default_variant_id: number | null
  /** [] for non-variable products. */
  default_variant_attributes: VariantAttributeLabel[]
  /** Before discount. */
  price: number | null
  /** What will be charged; null only without variants. */
  final_price: number | null
  has_discount: boolean
  /** Rounded; 0 without a discount. */
  discount_percent: number
  discount_end_time: string | null
  /** The END timestamp in ms, not a duration. */
  discount_time_remaining: number | null
  /** Start the add-to-cart quantity here. */
  order_limit_min: number | null
  /** 0 means unlimited. */
  order_limit_max: number | null
  /** Viewer-specific; always false in the anonymous responses the storefront caches. */
  is_in_wishlist: boolean
  created: string
  updated: string
}

/** One result of `GET product/wishlist/list/` (token required). */
export interface WishlistProductCard extends ProductCard {
  is_in_wishlist: true
  added_at: string
}

export type WishlistSort = 'added-desc' | 'added-asc'

export interface GalleryImage {
  id: number
  image: string
  /** Never empty: falls back to the product name. */
  alt: string
}

export interface ProductSpecification {
  id: number
  attribute_id: number
  attribute_name: string
  /** May be []. */
  values: string[]
  /** Free text. */
  custom_attribute_value: string | null
  show_in_product_description: boolean
  display_priority: number
}

/** A component of the default variant of a bundle. */
export interface BundleItem {
  /** The component's variant id; there is no product slug to link with. */
  variant: number
  product_name: string
  /** null for single-variant products. */
  variant_name: string | null
  quantity: number
  /** Never null. */
  image: string
}

/** Always five rows, 5 to 1; percents are rounded and may sum to 99. */
export interface RatingBreakdownRow {
  score: 5 | 4 | 3 | 2 | 1
  count: number
  percent: number
}

/** `GET product/detail/<slug>/`. Fetched without a token so it can be cached. */
export interface ProductDetail extends CatalogSeo {
  id: number
  /** Zero-padded id for display («شناسه محصول»), e.g. "010001". */
  product_code: string
  name: string
  slug: string
  extra_detail: string | null
  /** Plain text. */
  description: string | null
  /** HTML («نقد و بررسی»). */
  content: string | null
  /** The featured image; not part of `gallery`. */
  image: string
  type: ProductType
  content_type: ProductContentType
  badge: Badge | null
  brand: BrandLight | null
  /** Direct categories, drafts included: don't link. */
  categories: CategoryLight[]
  /** Deepest fully published chain, root to leaf, without the product; [] if none. */
  breadcrumb: CategoryBreadcrumbNode[]
  gallery: GalleryImage[]
  /** Every variant, out-of-stock ones included: the admin default first, then by id. */
  variants: Variant[]
  /** [] for non-variable products. */
  variant_options: VariantOption[]
  default_variant_id: number | null
  /** The full table, sorted by display_priority then id. */
  specifications: ProductSpecification[]
  /** The rows of `specifications` flagged for the description (duplicates). */
  highlighted_specifications: ProductSpecification[]
  /** [] when the section is switched off. */
  related_products: ProductCard[]
  /** The product's own, else inherited from its first category. */
  consider_before_buying: ConsiderBeforeBuying | null
  question_answers: QuestionAnswer[]
  /** Visible root reviews. */
  comment_count: number
  /** Visible root questions. */
  question_count: number
  rating: number
  rating_count: number
  rating_breakdown: RatingBreakdownRow[]
  in_stock: boolean
  is_special_product: boolean
  is_collection: boolean
  /** [] unless `is_collection`. */
  bundle_items: BundleItem[]
  enable_major: boolean
  /** Exactly one element. */
  structured_data: ProductJsonLd[]
  /** Home and the category chain, without the product. */
  breadcrumb_structured_data: BreadcrumbListJsonLd
  /** true only in a staff preview of a draft: show a banner and noindex. */
  is_unpublished: boolean
  is_in_wishlist: boolean
  created: string
  updated: string
}
