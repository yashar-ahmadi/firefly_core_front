/**
 * What a listing's filter UI offers and shows: the facet groups worth offering on a route, the
 * active filters as labelled chips, their count, and "clear all". Pure: used by the Server
 * Component and by the client leaves alike.
 */
import type { ListingApiQuery, ListingContext } from '@/features/catalog/listing-params'
import type {
  FilterAttribute,
  FilterBrandOption,
  FilterCategoryOption,
  FiltersMetadata,
  SortOption,
} from '@/lib/api/types/catalog'
import { formatToman, toPersianDigits } from '@/lib/format'

export interface FacetGroups {
  /** One choice at most (the API takes one category); FacetList hides the empty options. */
  categories: FilterCategoryOption[]
  brands: FilterBrandOption[]
  /** Only attributes with values. */
  attributes: FilterAttribute[]
  /** The slider bounds; null when there is no range to choose from. */
  price: { min: number; max: number } | null
  /** The name of the URL's category when it is not among `categories` (a deeper category). */
  chosenCategoryName?: string
}

const NO_FACETS: FacetGroups = { categories: [], brands: [], attributes: [], price: null }

/**
 * The context to load filter metadata for: the route context plus the URL's category, when the
 * route has no category of its own and the URL picks one, so choosing a category on a brand,
 * list or generic listing brings that category's attributes, brands and price range. (The API
 * reads only the first of category > brand > list.) null when the route context is all there is.
 */
export function filtersContextFor(
  context: ListingContext,
  q: ListingApiQuery,
): ListingContext | null {
  if (context.category !== undefined || q.category === undefined) return null
  return { ...context, category: q.category }
}

/**
 * The facet groups of a listing. A group is left out when it has nothing to offer, or when the
 * route context supplies its key (no category facet on a category page, no brand facet on a
 * brand page: the URL could not change them). There is never a list facet.
 *
 * `categoryFilters` is where the category options come from: the route context's own metadata
 * when `filters` follows a category chosen in the URL, so the choice stays among the options it
 * was made from (checked, and switchable).
 */
export function facetGroups(
  filters: FiltersMetadata | null,
  context: ListingContext,
  categoryFilters: FiltersMetadata | null = filters,
): FacetGroups {
  if (filters === null) return NO_FACETS
  const options = categoryFilters?.categories ?? []
  const anyCategory = options.some((option) => option.product_count > 0)
  return {
    categories: context.category === undefined && anyCategory ? options : [],
    brands: context.brand === undefined ? filters.brands : [],
    attributes: filters.attributes.filter((attribute) => attribute.values.length > 0),
    price: filters.price.max > filters.price.min ? filters.price : null,
  }
}

/** The switches of the filter panel, in display order. */
export const FLAG_FILTERS = ['in_stock', 'has_discount', 'is_special'] as const
export type FlagFilter = (typeof FLAG_FILTERS)[number]

/** The switch label is the `true` one; `false` only arrives from hand-made links. */
export const FLAG_LABELS: Record<FlagFilter, { true: string; false: string }> = {
  in_stock: { true: 'فقط کالاهای موجود', false: 'فقط کالاهای ناموجود' },
  has_discount: { true: 'فقط تخفیف‌دارها', false: 'بدون تخفیف' },
  is_special: { true: 'کالاهای ویژه', false: 'غیر از کالاهای ویژه' },
}

/** The API's five sorts, for the rare listing without filter metadata. */
export const FALLBACK_SORT_OPTIONS: SortOption[] = [
  { value: 'date-desc', label: 'جدیدترین' },
  { value: 'date-asc', label: 'قدیمی‌ترین' },
  { value: 'price-desc', label: 'گران‌ترین' },
  { value: 'price-asc', label: 'ارزان‌ترین' },
  { value: 'sale', label: 'پرفروش‌ترین' },
]

export interface ActiveFilter {
  /** Unique among the chips. */
  key: string
  label: string
  /** Applied with `useListingUrl().set`, it removes this filter only. */
  patch: Partial<ListingApiQuery>
}

function priceLabel(min: number | undefined, max: number | undefined): string {
  const amount = (n: number) => formatToman(n, { suffix: false })
  if (min !== undefined && max !== undefined) return `از ${amount(min)} تا ${amount(max)} تومان`
  return min !== undefined ? `از ${amount(min)} تومان` : `تا ${amount(max ?? 0)} تومان`
}

/** The chosen attribute values as `[id, label]`, grouped by attribute; unknown ids last. */
function attributeValueLabels(ids: number[], attributes: FilterAttribute[]): [number, string][] {
  const chosen = new Set(ids)
  const labels: [number, string][] = []
  for (const attribute of attributes) {
    for (const value of attribute.values) {
      if (!chosen.delete(value.id)) continue
      labels.push([value.id, `${attribute.name}: ${value.name}`])
    }
  }
  for (const id of chosen) labels.push([id, `ویژگی ${toPersianDigits(id)}`])
  return labels
}

/**
 * The active filters of a URL query, in panel order, labelled from the filter metadata (a slug
 * or id the metadata does not know is still shown, so it can be removed). The sort, page and
 * `special_first` are not filters.
 */
export function activeFilters(q: ListingApiQuery, groups: FacetGroups): ActiveFilter[] {
  const chips: ActiveFilter[] = []
  if (q.search) {
    chips.push({ key: 'search', label: `جستجو: ${q.search}`, patch: { search: undefined } })
  }
  if (q.category) {
    const name =
      groups.categories.find((option) => option.slug === q.category)?.name ??
      groups.chosenCategoryName
    chips.push({
      key: 'category',
      label: name ?? q.category,
      patch: { category: undefined },
    })
  }
  for (const slug of q.brand ?? []) {
    const name = groups.brands.find((option) => option.slug === slug)?.name
    chips.push({
      key: `brand:${slug}`,
      label: name ?? slug,
      patch: { brand: q.brand?.filter((other) => other !== slug) },
    })
  }
  for (const [id, label] of attributeValueLabels(q.attribute_values ?? [], groups.attributes)) {
    chips.push({
      key: `attribute:${id}`,
      label,
      patch: { attribute_values: q.attribute_values?.filter((other) => other !== id) },
    })
  }
  if (q.min_price !== undefined || q.max_price !== undefined) {
    chips.push({
      key: 'price',
      label: priceLabel(q.min_price, q.max_price),
      patch: { min_price: undefined, max_price: undefined },
    })
  }
  for (const flag of FLAG_FILTERS) {
    const value = q[flag]
    if (value === undefined) continue
    chips.push({ key: flag, label: FLAG_LABELS[flag][`${value}`], patch: { [flag]: undefined } })
  }
  return chips
}

/** How many filters are active (each brand and attribute value counts; a price range once). */
export function activeFilterCount(q: ListingApiQuery): number {
  return activeFilters(q, NO_FACETS).length
}

/** The query without any filter: only the sort and `special_first` stay. */
export function clearFilters(q: ListingApiQuery): ListingApiQuery {
  const kept: ListingApiQuery = {}
  if (q.sort !== undefined) kept.sort = q.sort
  if (q.special_first !== undefined) kept.special_first = q.special_first
  return kept
}
