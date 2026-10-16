import type { Cart, CartLine } from '@/lib/api/types/cart'

// Cart fixtures shaped like the live API (guest, dev sample data) as the BFF hands them to the
// browser: no `token`.

export const EMPTY_COUPON: Cart['coupon'] = {
  code: null,
  title: null,
  discount_type: null,
  amount: 0,
  max_discount_amount: null,
  detached_reason: null,
}

export const EMPTY_SHIPPING: Cart['shipping'] = {
  code: null,
  title: null,
  is_selected: false,
  is_available: false,
  price: 0,
  packaging_cost: 0,
  reason: null,
  freight_paid_by_recipient: false,
  cash_on_delivery: false,
  cod_fee: 0,
}

/** Variant 10001 (Samsung Galaxy S25 Ultra) as `POST cart/item/add/` returned it. */
export function cartLine(changes: Partial<CartLine> = {}): CartLine {
  const quantity = changes.quantity ?? 1
  const unit = changes.unit_final_price ?? 78_500_000
  return {
    variant_id: 10001,
    product_id: 10001,
    product_name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا',
    product_slug: 'samsung-galaxy-s25-ultra',
    variant_name: 'رنگ: مشکی | حافظه داخلی: ۲۵۶ گیگابایت | حافظه رم: ۱۲ گیگابایت',
    sku: 'SM-S25U-BLK-256',
    image: 'http://localhost:8000/static/defaults/default.png',
    unit_name: 'عدد',
    quantity,
    unit_price: unit,
    unit_discount: 0,
    unit_final_price: unit,
    line_subtotal: unit * quantity,
    line_discount: 0,
    line_total: unit * quantity,
    weight_grams: 380,
    in_stock: true,
    available_quantity: 13,
    issue: null,
    order_limit_max: 0,
    order_limit_min: 1,
    ...changes,
  }
}

/** A guest cart holding `lines`; money fields are made up, as the API's own (never summed here). */
export function cart(lines: CartLine[] = [], changes: Partial<Cart> = {}): Cart {
  const goods = lines.reduce((sum, line) => sum + line.line_total, 0)
  return {
    channel: 'website',
    item_count: lines.reduce((sum, line) => sum + line.quantity, 0),
    is_empty: lines.length === 0,
    is_orderable: true,
    lines,
    goods_subtotal: goods,
    item_discount: 0,
    goods_total: goods,
    coupon: EMPTY_COUPON,
    coupon_discount: 0,
    goods_payable: goods,
    shipping: EMPTY_SHIPPING,
    shipping_cost: 0,
    packaging_cost: 0,
    shipping_discount: 0,
    tax_amount: goods / 10,
    cod_fee: 0,
    total: goods + goods / 10,
    amount_payable_online: goods + goods / 10,
    amount_due_on_delivery: 0,
    prepayment: 0,
    amount_charged_online: goods + goods / 10,
    amount_to_collect_on_delivery: 0,
    total_savings: 0,
    total_weight_grams: 380 * lines.length,
    destination: null,
    adjustments: [],
    ...changes,
  }
}

export const MSG_OK = 'درخواست با موفقیت انجام شد.'
export const MSG_ADDED = 'کالا به سبد خرید اضافه شد.'
export const MSG_REMOVED = 'کالا از سبد خرید حذف شد.'

/** What `bffFetch` resolves with. */
export function result(data: Cart, msg = MSG_OK) {
  return { data, msg, status: 200 }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
