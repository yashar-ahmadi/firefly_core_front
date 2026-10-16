import type { ProductDetail, Variant, VariantOption } from '@/lib/api/types/catalog'

// The variant picker's algorithm (product digest §5.2). Pure: safe in any bundle.

/** The chosen value per axis: attribute id → value id. */
export type Selection = Map<number, number>

/** The dynamic state of one value, given the other axes' current picks. */
export type ValueState = 'buyable' | 'out_of_stock' | 'no_such_combo'

/** The selection naming `variant`'s values, one per axis (values on no axis are left out). */
export function selectionOf(options: readonly VariantOption[], variant: Variant): Selection {
  const axisOf = new Map<number, number>()
  for (const option of options) {
    for (const value of option.values) axisOf.set(value.id, option.attribute_id)
  }
  const selection: Selection = new Map()
  for (const id of variant.attribute_value_ids) {
    const axis = axisOf.get(id)
    if (axis !== undefined) selection.set(axis, id)
  }
  return selection
}

/**
 * The starting selection: always the values of the variant `defaultId` (the server's
 * `default_variant_id`, or a `?variant=` the page checked), never a "first in stock" computed
 * here. Empty when there is no such variant: nothing can be bought.
 */
export function initialSelection(
  options: readonly VariantOption[],
  variants: readonly Variant[],
  defaultId: number | null,
): Selection {
  const variant = variants.find((candidate) => candidate.id === defaultId)
  return variant ? selectionOf(options, variant) : new Map()
}

/** The variant whose value set equals the selection exactly, or null (no such combination). */
export function resolveVariant(variants: readonly Variant[], sel: Selection): Variant | null {
  const want = new Set(sel.values())
  return (
    variants.find(
      (variant) =>
        variant.attribute_value_ids.length === want.size &&
        variant.attribute_value_ids.every((id) => want.has(id)),
    ) ?? null
  )
}

/**
 * `valueId` on `axisId` beside the other axes' picks: `buyable` when a variant with them all is
 * in stock, `out_of_stock` when such variants exist but none can be bought, `no_such_combo` when
 * none exists.
 */
export function valueState(
  variants: readonly Variant[],
  sel: Selection,
  axisId: number,
  valueId: number,
): ValueState {
  const fixed = [...sel].filter(([axis]) => axis !== axisId).map(([, value]) => value)
  const matches = variants.filter(
    (variant) =>
      variant.attribute_value_ids.includes(valueId) &&
      fixed.every((id) => variant.attribute_value_ids.includes(id)),
  )
  if (matches.length === 0) return 'no_such_combo'
  return matches.some((variant) => variant.in_stock) ? 'buyable' : 'out_of_stock'
}

/**
 * The selection after choosing `valueId` on `axisId`. An existing combination is kept as chosen,
 * in stock or not. A missing one is re-seeded from the variant carrying the clicked value that
 * keeps the most of the other picks, preferring one in stock, then the server's order (the
 * default first, then by id).
 */
export function selectValue(
  options: readonly VariantOption[],
  variants: readonly Variant[],
  sel: Selection,
  axisId: number,
  valueId: number,
): Selection {
  const next: Selection = new Map(sel).set(axisId, valueId)
  if (resolveVariant(variants, next)) return next

  const others = [...sel].filter(([axis]) => axis !== axisId).map(([, value]) => value)
  let best: Variant | null = null
  let bestScore = -1
  for (const variant of variants) {
    if (!variant.attribute_value_ids.includes(valueId)) continue
    const score = others.filter((id) => variant.attribute_value_ids.includes(id)).length
    const closer = score > bestScore
    const sameButInStock = score === bestScore && variant.in_stock && !best?.in_stock
    if (best === null || closer || sameButInStock) {
      best = variant
      bestScore = score
    }
  }
  return best ? selectionOf(options, best) : next
}

type VariantSource = Pick<ProductDetail, 'variant_options' | 'variants' | 'default_variant_id'>

/**
 * The variant to buy: the selection's for a product with a picker; the default variant for one
 * without options (simple, downloadable, virtual, or a variable product the API sends none for).
 */
export function currentVariant(product: VariantSource, sel: Selection): Variant | null {
  if (product.variant_options.length === 0) {
    return product.variants.find((variant) => variant.id === product.default_variant_id) ?? null
  }
  return resolveVariant(product.variants, sel)
}

/**
 * The variant a shared link names (`?variant=<id>`, a variant of this product), else the
 * default. Only the first value counts, written as plain digits.
 */
export function requestedVariantId(
  product: Pick<ProductDetail, 'variants' | 'default_variant_id'>,
  raw: string | string[] | undefined,
): number | null {
  const text = Array.isArray(raw) ? raw[0] : raw
  if (text !== undefined && /^\d{1,12}$/.test(text)) {
    const id = Number(text)
    if (product.variants.some((variant) => variant.id === id)) return id
  }
  return product.default_variant_id
}
