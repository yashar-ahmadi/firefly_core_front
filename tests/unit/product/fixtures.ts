import type { ProductDetail, Variant } from '@/lib/api/types/catalog'
import s25 from '../../fixtures/product-s25.json'

// The live S25 Ultra payload (GET product/detail/samsung-galaxy-s25-ultra/, dev sample data):
// three axes (colour, storage, a single-value RAM), four of nine combinations, variant 10004
// (silver, 1 TB) out of stock, variant 10003 (gold) with «only 3 left».

export const AXIS = { colour: 10001, storage: 10002, ram: 10003 } as const
export const VALUE = {
  black: 10001,
  silver: 10003,
  gold: 10004,
  gb256: 10015,
  gb512: 10016,
  tb1: 10017,
  ram12: 10021,
} as const

/** A fresh copy of the S25 Ultra detail, with `changes` over it. */
export function s25Product(changes: Partial<ProductDetail> = {}): ProductDetail {
  return { ...(structuredClone(s25) as unknown as ProductDetail), ...changes }
}

export function variantOf(product: ProductDetail, id: number): Variant {
  const variant = product.variants.find((candidate) => candidate.id === id)
  if (!variant) throw new Error(`no variant ${id}`)
  return variant
}

/** The S25 detail with each variant changed by `change(variant)`. */
export function withVariants(
  change: (variant: Variant) => Partial<Variant>,
  product: ProductDetail = s25Product(),
): ProductDetail {
  return { ...product, variants: product.variants.map((v) => ({ ...v, ...change(v) })) }
}

/** The out-of-stock simple product `chips-pack-family` (dev sample data), trimmed. */
export function chipsProduct(changes: Partial<ProductDetail> = {}): ProductDetail {
  const base = s25Product()
  const variant: Variant = {
    ...variantOf(base, 10001),
    id: 10128,
    sku: 'CHIPS-CHZ-150',
    variant_name: null,
    image: null,
    attribute_value_ids: [],
    price: 125_000,
    final_price: 125_000,
    in_stock: false,
    low_stock_quantity: 0,
    weight_grams: 160,
  }
  return {
    ...base,
    id: 10067,
    product_code: '010067',
    name: 'چیپس خانواده طعم پنیری',
    slug: 'chips-pack-family',
    extra_detail: null,
    type: 'simple',
    badge: null,
    brand: null,
    gallery: [],
    variants: [variant],
    variant_options: [],
    default_variant_id: 10128,
    highlighted_specifications: [],
    in_stock: false,
    ...changes,
  }
}
