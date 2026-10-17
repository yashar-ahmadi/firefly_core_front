import type { CouponBlock, CouponErrorCode } from '@/lib/api/types/cart'

// Why a coupon does not apply (cart digest §11.2): one map for the reason a coupon was taken off
// the cart (`coupon.detached_reason`, said once) and, where the API's own detail is not at hand,
// for a refusal. Pure.

const REASONS: Record<CouponErrorCode, string> = {
  coupon_invalid: 'کد تخفیف معتبر نیست.',
  coupon_inactive: 'کد تخفیف معتبر نیست.',
  coupon_not_started: 'این کد هنوز فعال نشده است.',
  coupon_expired: 'مهلت استفاده از این کد به پایان رسیده است.',
  coupon_usage_limit_reached: 'ظرفیت این کد تکمیل شده است.',
  coupon_user_limit_reached: 'شما قبلاً از این کد استفاده کرده\u{200C}اید.',
  coupon_first_order_only: 'این کد فقط برای اولین سفارش است.',
  coupon_min_spend_not_met: 'مبلغ سبد خرید به حداقل لازم برای این کد نمی\u{200C}رسد.',
  coupon_max_spend_exceeded: 'مبلغ سبد خرید از سقف مجاز این کد بیشتر است.',
  coupon_not_applicable: 'این کد شامل کالاهای سبد شما نمی\u{200C}شود.',
}

/** The reason in Persian; a code the API adds later gets a general sentence. */
export function couponReason(code: string): string {
  return REASONS[code as CouponErrorCode] ?? 'این کد تخفیف دیگر قابل استفاده نیست.'
}

/** «کد تخفیف «X» دیگر روی سبد شما اعمال نمی‌شود.» and why. */
export function detachedCouponText(code: string | null, reason: string): string {
  const named = code ? `کد تخفیف «${code}»` : 'کد تخفیف'
  return `${named} دیگر روی سبد شما اعمال نمی\u{200C}شود. ${couponReason(reason)}`
}

/**
 * Whether a coupon is on the cart: it has a code (cart digest §5.3), and this answer is not the
 * one that took it off (the detaching answer still names it, with `discount_type` null and the
 * `detached_reason`; the next one has no code).
 */
export function couponApplied(coupon: CouponBlock): boolean {
  return coupon.code !== null && coupon.detached_reason === null
}
