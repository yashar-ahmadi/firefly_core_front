import { THROTTLED_MESSAGE } from '@/features/account/lists/list-error'
import type { IntentError } from './api'

// What to say when a payment could not start (order digest §5.4–5.8, §8.3): the fixed sentences
// the digest prescribes, otherwise the API's own Persian detail. Pure.

const FIXED: Partial<Record<IntentError['problem'], string>> = {
  gateway_rejected: 'بانک تراکنش را نپذیرفت. می\u{200C}توانید با درگاه یا روش دیگری پرداخت کنید.',
  gateway_unavailable: 'درگاه بانک پاسخ نداد؛ کمی بعد دوباره تلاش کنید.',
  gateway_refresh: 'این درگاه در حال حاضر در دسترس نیست؛ درگاه یا روش دیگری را انتخاب کنید.',
  gateway_broken:
    'پرداخت با درگاه بانکی در این فروشگاه اکنون ممکن نیست. با روش دیگری پرداخت کنید یا با پشتیبانی تماس بگیرید.',
  attempt_open: 'یک پرداخت نیمه\u{200C}تمام برای این سفارش دارید.',
  starting: 'پرداخت قبلی شما هنوز در حال آماده شدن است؛ چند لحظه بعد دوباره تلاش کنید.',
  token_expired: 'مهلت انتقال به درگاه تمام شد؛ دوباره پرداخت کنید.',
  throttled: THROTTLED_MESSAGE,
}

export function intentMessage(error: IntentError): string {
  const fixed = FIXED[error.problem]
  if (fixed) return fixed
  if (error.problem === 'use_wallet') return `${error.detail} «کیف پول» انتخاب شد.`
  return error.detail
}
