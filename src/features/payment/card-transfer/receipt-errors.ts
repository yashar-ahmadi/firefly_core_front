import { ApiError, GENERIC_ERROR_DETAIL, NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { RECEIPT_MESSAGES, type ReceiptErrors, type ReceiptField } from './validate-receipt'

// What a refused receipt upload does on the page (order digest §3.2.8, §8.4; live bodies in
// tests/fixtures/card-transfer-receipt-refusals.json). Pure.
//
// - The picture's own refusals (413 too large, too small, not a JPEG/PNG/WEBP, not a picture at
//   all: DRF's `invalid_image` on `image`) go under the picture; the BFF's own 413 (over its
//   6 MiB) too.
// - A validation error goes under the field its `attr` names; several come at once.
// - A destination card that does not exist (`does_not_exist` on `destination_card`) or is no
//   longer active (`payment_destination_card_invalid`): the cards are read again and the shopper
//   chooses again.
// - A receipt already sent (409): the outcome. The attempt no longer open
//   (`payment_target_invalid`): a new one. 403/404: the calm page. 429 (10 an hour): its wait.
// - `503 upload_retry` (the BFF refreshed the session while the upload streamed, which cannot be
//   sent twice) and a lost answer: «دوباره تلاش کنید», every field and the file kept. A session
//   found gone (401) ends it (the page turns into a guest's); the receipt needs none, so the press
//   is simply made again.

export const UPLOAD_RETRY = 'ارسال رسید کامل نشد؛ دوباره تلاش کنید'
export const CARDS_CHANGED =
  'کارت انتخاب\u{200C}شده دیگر پذیرفته نمی\u{200C}شود؛ فهرست کارت\u{200C}ها دوباره خوانده شد. کارتی را که به آن واریز کرده\u{200C}اید دوباره انتخاب کنید'
/** The same refusal when the cards could not be read again (the list on screen is the old one). */
export const CARDS_NOT_REREAD =
  'کارت انتخاب\u{200C}شده دیگر پذیرفته نمی\u{200C}شود و فهرست کارت\u{200C}ها دوباره خوانده نشد. صفحه را دوباره باز کنید یا کمی بعد دوباره تلاش کنید'

export type ReceiptRefusal =
  /** Under the fields; `reloadCards`: read the cards again and ask for the card again. */
  | { kind: 'fields'; errors: ReceiptErrors; reloadCards: boolean }
  /** `payment_receipt_already_submitted`: show the outcome. */
  | { kind: 'submitted' }
  /** `payment_target_invalid`: not a card transfer, or no longer open; a new attempt. */
  | { kind: 'closed' }
  /** Press again, nothing lost; `session`: the session was found gone (end it first). */
  | { kind: 'retry'; message: string; session: boolean }
  | { kind: 'throttled'; retryAfter: number | null }
  | { kind: 'refused'; reason: 'forbidden' | 'not_found' }
  | { kind: 'other'; message: string }

const FIELDS: ReadonlySet<string> = new Set<ReceiptField>([
  'image',
  'payer_name',
  'payer_card_last_digits',
  'paid_at',
  'destination_card',
  'bank_reference',
])

/** The picture's refusals, with no `attr` (the API's own codes). */
const IMAGE_CODES = new Set(['payment_receipt_image_too_small', 'payment_receipt_image_invalid'])

const fields = (errors: ReceiptErrors, reloadCards = false): ReceiptRefusal => ({
  kind: 'fields',
  errors,
  reloadCards,
})

export function receiptRefusal(error: unknown): ReceiptRefusal {
  if (isSessionExpiredError(error)) return { kind: 'retry', message: UPLOAD_RETRY, session: true }
  if (!(error instanceof ApiError)) return { kind: 'other', message: GENERIC_ERROR_DETAIL }
  if (error.status === 429) return { kind: 'throttled', retryAfter: error.retryAfter }
  if (error.code === 'upload_retry') return { kind: 'retry', message: UPLOAD_RETRY, session: false }
  if (
    error.status === 0 ||
    error.code === 'non_json_response' ||
    error.code === 'session_refresh_unavailable'
  ) {
    return { kind: 'retry', message: NETWORK_ERROR_DETAIL, session: false }
  }
  if (error.status === 413) return fields({ image: RECEIPT_MESSAGES.imageSize })
  if (error.code === 'payment_receipt_already_submitted') return { kind: 'submitted' }
  if (error.code === 'payment_target_invalid') return { kind: 'closed' }
  if (error.code === 'payment_forbidden') return { kind: 'refused', reason: 'forbidden' }
  if (error.code === 'payment_not_found') return { kind: 'refused', reason: 'not_found' }
  if (error.code === 'payment_destination_card_invalid') {
    return fields({ destination_card: CARDS_CHANGED }, true)
  }
  if (IMAGE_CODES.has(error.code)) return fields({ image: error.detail })

  const errors: ReceiptErrors = {}
  let reloadCards = false
  for (const item of error.errors) {
    const field = item.attr as ReceiptField | null
    if (!field || !FIELDS.has(field) || errors[field]) continue
    if (field === 'destination_card') {
      errors.destination_card = CARDS_CHANGED
      reloadCards = true
    } else if (field === 'image' && item.code === 'invalid_image') {
      errors.image = RECEIPT_MESSAGES.imageDecode
    } else {
      errors[field] = item.detail || GENERIC_ERROR_DETAIL
    }
  }
  if (Object.keys(errors).length > 0) return fields(errors, reloadCards)
  return { kind: 'other', message: error.detail }
}
