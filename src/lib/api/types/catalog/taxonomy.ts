/**
 * Categories, brands and curated list pages (product digest §3.2–3.7). Pure types.
 * Every detail here returns 404 when the record is unknown or a draft.
 */
import type { BreadcrumbListJsonLd, SortValue } from '@/lib/api/types/catalog/enums'
import type { CategoryBanner } from '@/lib/api/types/display'
import type { CategoryCard } from '@/lib/api/types/settings'

export type { CategoryCard } from '@/lib/api/types/settings'

/** One row of `GET product/category/list/` (the digest's name for `CategoryCard`). */
export type CategoryListItem = CategoryCard

/** A category without its path: never build a link from it (cards and list pages carry these). */
export interface CategoryLight {
  id: number
  name: string
  slug: string
  parent_id: number | null
}

/** Link with `/product-category/{path}/`. */
export interface CategoryBreadcrumbNode extends CategoryLight {
  path: string
}

export interface ConsiderBeforeBuying {
  title: string | null
  /** HTML. */
  text: string
  /** Label of the button that opens `text`. */
  button: string | null
}

/** The operator's FAQ, not user Q&A. */
export interface QuestionAnswer {
  question: string
  answer: string
}

/** SEO fields shared by every catalog detail. "" means unset: omit that tag. */
export interface CatalogSeo {
  /** Falls back to the name; often already carries the shop suffix. */
  page_title: string
  page_description: string
  page_keywords: string
  /** null means self-canonical. */
  canonical_link: string | null
  breadcrumb_structured_data: BreadcrumbListJsonLd
}

/** `GET product/category/<slug>/`: the category's own (last) slug, page content only. */
export interface CategoryDetail extends CategoryBreadcrumbNode, CatalogSeo {
  short_description: string | null
  /** Plain text. */
  description: string | null
  /** HTML. */
  content: string | null
  image: string
  icon: string
  /** Root to this category; the last item is the category itself. */
  breadcrumb: CategoryBreadcrumbNode[]
  /** Not applied by the server: send it as `sort`. */
  default_sorting: SortValue | null
  /** Only when it has text and is flagged for the category page. */
  consider_before_buying: ConsiderBeforeBuying | null
  /** The banners' «سبک نمایش»: a `DisplayStyle` (`displayStyle()`), there even with no banner. */
  banner_style: string
  /** The active banners, in order: one is a single banner, several a group; [] for none. */
  banners: CategoryBanner[]
  question_answers: QuestionAnswer[]
  created: string
  updated: string
}

/** One row of `GET product/brand/list/` and of the search `brands` group. Link: `/brand/{slug}/`. */
export interface BrandCard {
  id: number
  name: string
  slug: string
  /** 70×70 JPEG crop. */
  image: string
  /** All published products of the brand. */
  product_count: number
  created: string
  updated: string
}

/** The digest's name for `BrandCard`. */
export type BrandListItem = BrandCard

/** `GET product/brand/<slug>/`. No product count: use `count` of the brand's product list. */
export interface BrandDetail extends CatalogSeo {
  id: number
  name: string
  slug: string
  /** 70×70 JPEG crop only. */
  image: string
  /** Plain text. */
  description: string | null
  /** HTML. */
  content: string | null
  created: string
  updated: string
}

/** One row of `GET product/list-page/list/`, newest first. */
export interface ProductListPageListItem {
  id: number
  name: string
  slug: string
  product_category_id: number | null
  default_sorting: SortValue | null
  created: string
  updated: string
}

/**
 * `GET product/list-page/<slug>/`: a curated landing page. It has no `breadcrumb` array: build the
 * visible crumb from `breadcrumb_structured_data` or the category tree.
 */
export interface ProductListPageDetail extends CatalogSeo {
  id: number
  name: string
  slug: string
  /** Plain text. */
  description: string | null
  /** HTML. */
  content: string | null
  /** Has no `path`. */
  product_category: CategoryLight | null
  /** false: `filters/?list=` returns `categories: []`. */
  show_category_filter: boolean
  default_sorting: SortValue | null
  question_answers: QuestionAnswer[]
  created: string
  updated: string
}

/** The plan's name for `ProductListPageDetail`. */
export type ListPageDetail = ProductListPageDetail
