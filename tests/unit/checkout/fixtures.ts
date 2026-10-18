import type { Address, Cart } from '@/lib/api/types/cart'
import type { ShippingOption, ShippingOptionList } from '@/lib/api/types/shipping'
import cartCod from '../../fixtures/checkout-cart-cod.json'
import cartDestination from '../../fixtures/checkout-cart-destination.json'
import cartTipax from '../../fixtures/checkout-cart-tipax.json'
import cityNotInProvince from '../../fixtures/checkout-city-not-in-province.json'
import codLimit from '../../fixtures/checkout-cod-limit.json'
import optionsTehran from '../../fixtures/checkout-options-tehran.json'
import shippingUnavailable from '../../fixtures/checkout-shipping-unavailable.json'
import { itemsCartFixture } from '../cart/fixtures'

// Captured live from the dev API (2026-10-17, a fresh guest cart token, never an account; the
// token stripped as the BFF strips it): tea 500 g × 2 (10119) and instant coffee × 1 (10123),
// then `cart/destination/ {province: 8, city: 301}` (Tehran, Tehran), the option list there,
// `shipping/select/` of peyk-tehran with COD and of tipax (recipient pays, fare 0 in the system,
// packaging 15,000), and the API's refusals: bar-sangin (unavailable for this weight), a city
// of another province, and the COD ceiling (an iPhone of 118,000,000 by peyk-tehran with COD).

const copy = <T>(value: unknown): T => structuredClone(value) as T
const data = <T>(envelope: unknown) => copy<{ data: T }>(envelope).data

/** The items cart (no destination yet). */
export const noDestinationCart = (changes: Partial<Cart> = {}) => itemsCartFixture(changes)
/** After `cart/destination/ {province: 8, city: 301}`: shipping not selected. */
export const destinationCart = (changes: Partial<Cart> = {}): Cart => ({
  ...data<Cart>(cartDestination),
  ...changes,
})
/** peyk-tehran with COD: total 2,438,000, online 70,000, at the door 2,368,000. */
export const codCart = (): Cart => data<Cart>(cartCod)
/** tipax: `freight_paid_by_recipient`, shipping_cost 0, packaging 15,000. */
export const tipaxCart = (): Cart => data<Cart>(cartTipax)

/** The option list in Tehran: peyk 70,000 (COD), pishtaz, sefareshi, tipax 15,000 (recipient), bar-sangin unavailable, hozouri 0. */
export const tehranOptions = (): ShippingOptionList => data<ShippingOptionList>(optionsTehran)
export const option = (code: string, changes: Partial<ShippingOption> = {}): ShippingOption => ({
  ...tehranOptions().options.find((item) => item.code === code)!,
  ...changes,
})

/** 400 `cart_cod_limit_exceeded` (the API's body; the plan says 409, the API answers 400). */
export const codLimitBody = () => copy<Record<string, unknown>>(codLimit)
/** 400 `cart_shipping_method_unavailable` (bar-sangin: «برای این وزن روش های ارسال ارزان تری…»). */
export const unavailableBody = () => copy<Record<string, unknown>>(shippingUnavailable)
/** 400 `cart_city_not_in_province`. */
export const cityNotInProvinceBody = () => copy<Record<string, unknown>>(cityNotInProvince)

/** A saved address shaped like the address book's (cart digest §7). */
export function address(changes: Partial<Address> = {}): Address {
  return {
    id: 10018,
    title: 'خانه',
    receiver_first_name: 'کامران',
    receiver_last_name: 'یزدی',
    receiver_full_name: 'کامران یزدی',
    receiver_mobile: '+989021234514',
    province: 8,
    province_name: 'تهران',
    city: 301,
    city_name: 'تهران',
    address: 'خیابان ولیعصر، کوچهٔ بهار',
    plaque: '12',
    unit: '3',
    full_address: 'تهران، تهران، خیابان ولیعصر، کوچهٔ بهار، پلاک 12، واحد 3',
    postal_code: '1234567890',
    latitude: null,
    longitude: null,
    is_default: true,
    created: '2026-10-01T10:00:00+03:30',
    updated: '2026-10-01T10:00:00+03:30',
    ...changes,
  }
}

/** The cart with `saved` as its destination (signed in, by address). */
export function addressCart(saved: Address = address(), changes: Partial<Cart> = {}): Cart {
  return destinationCart({
    destination: {
      address: saved,
      province_id: saved.province,
      province_name: saved.province_name,
      city_id: saved.city,
      city_name: saved.city_name,
    },
    ...changes,
  })
}
