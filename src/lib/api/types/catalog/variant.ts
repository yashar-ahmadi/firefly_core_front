/** Variants and the variant picker (product digest §3.11, §5.2). Pure types. */
import type { InputType, ProductType } from '@/lib/api/types/catalog/enums'

export interface VariantOptionValue {
  id: number
  name: string
  /** HEX, for `color`; may be null on legacy data. */
  color: string | null
  /** Absolute image URL, for `pattern`. */
  pattern: string | null
  display_priority: number
  /** STATIC: some purchasable variant carries this value; ignores the current selection. */
  has_available_variant: boolean
}

/** One picker axis; render the axes in array order. */
export interface VariantOption {
  attribute_id: number
  attribute_name: string
  input_type: InputType
  /** Only the values this product's variants use. */
  values: VariantOptionValue[]
}

export interface Variant {
  /** The id sent to the cart. */
  id: number
  sku: string | null
  /** e.g. «رنگ: مشکی | حافظه داخلی: ۲۵۶ گیگابایت»; null for simple products. */
  variant_name: string | null
  /** 500×500; null means use the product image. */
  image: string | null
  /** Resolve a selection by exact set equality; [] for simple products. */
  attribute_value_ids: number[]
  /** Before discount. */
  price: number
  /** Charged; floor 0. */
  final_price: number
  /** Amount off right now: `price - discount === final_price`. */
  discount: number | null
  has_discount: boolean
  discount_percent: number
  discount_start_time: string | null
  discount_end_time: string | null
  /** The END timestamp in ms. */
  discount_time_remaining: number | null
  /** The only buyability flag. */
  in_stock: boolean
  /** Marketing text only, never a cap; 0 is not null. */
  low_stock_quantity: number | null
  /** 0 means unlimited. */
  order_limit_max: number
  /** 1 means no minimum. */
  order_limit_min: number
  /** Units per pack (≥ 1); quantities count packs. */
  packing_factor: number
  /** «عدد», «بسته»…; null means «عدد». */
  unit_name: string | null
  weight_grams: number | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  /** Wholesale: display only, never charged. */
  major_price: number | null
  major_min_order_limit: number | null
}

/** `GET product/detail/<slug>/variants/`: the picker for a card's buy button. */
export interface ProductVariants {
  product_id: number
  type: ProductType
  in_stock: boolean
  default_variant_id: number | null
  /** Equals the detail's `variant_options`; may be [] even for a variable product. */
  options: VariantOption[]
  /** Equals the detail's `variants`. */
  variants: Variant[]
}
