import type { CategoryLight, ProductCard } from '@/lib/api/types/catalog'

// What the compare list keeps per product. Pure: safe in Server Components (the card builds the
// item on the server and hands it to the client toggle).

export interface CompareItem {
  slug: string
  name: string
  image: string
  /** The deepest of the card's direct categories; null when the card has none. */
  categoryId: number | null
}

/**
 * The deepest category among a card's direct categories: one that is no other's parent (the
 * first such, when the product sits in unrelated categories). Cards carry no category paths,
 * so this is the best depth signal the list API gives.
 */
export function deepestCategoryId(categories: readonly CategoryLight[]): number | null {
  const parents = new Set(categories.map((category) => category.parent_id))
  return categories.find((category) => !parents.has(category.id))?.id ?? categories[0]?.id ?? null
}

export function compareItemFrom(
  product: Pick<ProductCard, 'slug' | 'name' | 'image' | 'categories'>,
): CompareItem {
  return {
    slug: product.slug,
    name: product.name,
    image: product.image,
    categoryId: deepestCategoryId(product.categories),
  }
}

export function isCompareItem(value: unknown): value is CompareItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.slug === 'string' &&
    typeof item.name === 'string' &&
    typeof item.image === 'string' &&
    (item.categoryId === null || typeof item.categoryId === 'number')
  )
}
