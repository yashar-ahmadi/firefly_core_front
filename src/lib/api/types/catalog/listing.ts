/** Listing configuration and facets (product digest §3.1, §3.9). Pure types. */
import type { InputType, SortValue } from '@/lib/api/types/catalog/enums'

/** `GET product/settings/`. Never hardcode these values. */
export interface ProductSettings {
  /** The default page size of `product/list/`. */
  paginator_number: number
  /** Show «ناموجود» on cards with `in_stock: false`. */
  show_out_of_stock_label: boolean
  /** Global switch for the related-products section. */
  related_items_display_status: boolean
  related_items_number: number
}

/** Counts cover the option's whole subtree within the context; 0-count options are not removed. */
export interface FilterCategoryOption {
  id: number
  name: string
  slug: string
  image: string
  icon: string
  product_count: number
}

export interface FilterBrandOption {
  id: number
  name: string
  slug: string
  image: string
}

/** Offered, not necessarily in stock. Send the ids as `attribute_values`. */
export interface FilterAttributeValue {
  id: number
  name: string
  color: string | null
  /** Absolute URL. */
  pattern: string | null
}

export interface FilterAttribute {
  id: number
  name: string
  input_type: InputType | null
  values: FilterAttributeValue[]
}

export interface SortOption {
  value: SortValue
  /** Persian label: build the sort dropdown from these. */
  label: string
}

/**
 * `GET product/filters/` for one context (category, brand, list or the whole store).
 * Static per context: the counts do not follow the shopper's other picks.
 */
export interface FiltersMetadata {
  categories: FilterCategoryOption[]
  /** Code-point order. */
  brands: FilterBrandOption[]
  attributes: FilterAttribute[]
  /** Over purchasable variants; both 0 when there are none. Use as the slider bounds. */
  price: { min: number; max: number }
  /** Always all five. */
  sort_options: SortOption[]
}
