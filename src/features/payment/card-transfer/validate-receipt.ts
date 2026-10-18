import { toLatinDigits } from '@/lib/format/digits'

// The card-transfer receipt's checks before it is sent (order digest §5.7 step 3, §2's multipart
// fields; Review Focus #4), the API's own rules (payment/validators.py, serializers.py): a JPEG,
// PNG or WEBP picture of at most 5 MiB, at least 300 × 300, at most 6000 pixels a side and 40
// megapixels; the payer's name (required, at most 200 characters); the card's last four digits,
// in any of the keyboard's digits; when the money was sent, never in the future (the API allows
// a phone's clock 5 minutes ahead, and so does this check); the shop card it went to; and the
// bank's reference, optional, at most 100 characters. Each message is Persian and keyed by the
// API's field name, so the server's answers land under the same fields. Pure: the picture's
// type, size and decoded dimensions are measured beforehand (receipt-image.ts).

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
export const MIN_RECEIPT_SIDE = 300
export const MAX_RECEIPT_SIDE = 6000
export const MAX_RECEIPT_PIXELS = 40_000_000
/** How far ahead of now `paid_at` may be: the API's own allowance for a clock that runs fast. */
export const PAID_AT_SKEW_MS = 5 * 60_000
export const PAYER_NAME_MAX = 200
export const BANK_REFERENCE_MAX = 100

export const RECEIPT_MESSAGES = {
  imageRequired: 'تصویر رسید را انتخاب کنید',
  imageType: 'فقط تصویر JPEG، PNG یا WEBP پذیرفته می\u{200C}شود',
  imageSize: 'حجم تصویر نباید بیشتر از ۵ مگابایت باشد',
  imageDecode: 'فایل تصویر معتبر نیست',
  imageSmall: 'طول و عرض تصویر باید دست\u{200C}کم ۳۰۰ پیکسل باشد',
  imageSide: 'طول و عرض تصویر نباید بیشتر از ۶۰۰۰ پیکسل باشد',
  imagePixels: 'تصویر نباید بیشتر از ۴۰ مگاپیکسل باشد',
  payerRequired: 'نام صاحب کارت مبدأ را وارد کنید',
  payerLong: 'نام صاحب کارت حداکثر ۲۰۰ نویسه است',
  digitsRequired: 'چهار رقم آخر کارت مبدأ را وارد کنید',
  digitsInvalid: 'چهار رقم آخر کارت باید دقیقاً ۴ رقم باشد',
  paidAtRequired: 'تاریخ و ساعت واریز را انتخاب کنید',
  paidAtFuture: 'زمان واریز نمی\u{200C}تواند در آینده باشد',
  cardRequired: 'کارتی را که به آن واریز کرده\u{200C}اید انتخاب کنید',
  referenceLong: 'شمارهٔ پیگیری حداکثر ۱۰۰ نویسه است',
} as const

/** The API's field names (multipart), the keys of the errors. */
export type ReceiptField =
  | 'image'
  | 'payer_name'
  | 'payer_card_last_digits'
  | 'paid_at'
  | 'destination_card'
  | 'bank_reference'

export type ReceiptErrors = Partial<Record<ReceiptField, string>>

/** What decoding the picture found: its pixels, or why it is not a picture we take. */
export type ImageProbe =
  | { ok: true; width: number; height: number }
  /** `format`: its bytes are not a JPEG, PNG or WEBP; `decode`: the browser could not read it. */
  | { ok: false; reason: 'format' | 'decode' }

export interface ReceiptImage {
  /** The file's MIME type, as the browser gives it. */
  type: string
  size: number
  probe: ImageProbe
}

export interface ReceiptInput {
  image: ReceiptImage | null
  payerName: string
  /** As typed; normalised before it is checked and sent (`normalizeLastDigits`). */
  lastDigits: string
  /** ISO at +03:30 (the Jalali input's), or "". */
  paidAt: string
  destinationCard: number | null
  bankReference: string
}

const M = RECEIPT_MESSAGES

/** Persian and Arabic digits as ASCII, spaces dropped: «۱۲ ۳۴» → «1234». */
export function normalizeLastDigits(value: string): string {
  return toLatinDigits(value).replace(/\s+/g, '')
}

/** Names browsers give a JPEG or PNG besides the standard ones. */
const TYPE_ALIASES: ReadonlySet<string> = new Set(['image/jpg', 'image/pjpeg', 'image/x-png'])

/**
 * The browser names the file as another kind of picture (GIF, HEIC, BMP…). An empty or unusual
 * type (none at all, `application/octet-stream`, an alias) says nothing: the bytes decide
 * (`probe`: they must be a JPEG, PNG or WEBP).
 */
const otherPicture = (type: string) =>
  type.startsWith('image/') &&
  !(RECEIPT_TYPES as readonly string[]).includes(type) &&
  !TYPE_ALIASES.has(type)

/** The picture's own problem, or null (the same checks as the API, in its order). */
export function imageError(image: ReceiptImage | null): string | null {
  if (!image) return M.imageRequired
  if (otherPicture(image.type)) return M.imageType
  if (image.size > MAX_RECEIPT_BYTES) return M.imageSize
  const { probe } = image
  if (!probe.ok) return probe.reason === 'format' ? M.imageType : M.imageDecode
  if (probe.width * probe.height > MAX_RECEIPT_PIXELS) return M.imagePixels
  if (probe.width > MAX_RECEIPT_SIDE || probe.height > MAX_RECEIPT_SIDE) return M.imageSide
  if (probe.width < MIN_RECEIPT_SIDE || probe.height < MIN_RECEIPT_SIDE) return M.imageSmall
  return null
}

function paidAtError(paidAt: string, now: Date): string | null {
  const time = paidAt ? new Date(paidAt).getTime() : Number.NaN
  if (Number.isNaN(time)) return M.paidAtRequired
  return time > now.getTime() + PAID_AT_SKEW_MS ? M.paidAtFuture : null
}

export function validateReceipt(input: ReceiptInput, now: Date): ReceiptErrors {
  const errors: ReceiptErrors = {}
  const image = imageError(input.image)
  if (image) errors.image = image
  const name = input.payerName.trim()
  if (!name) errors.payer_name = M.payerRequired
  else if (name.length > PAYER_NAME_MAX) errors.payer_name = M.payerLong
  const digits = normalizeLastDigits(input.lastDigits)
  if (!digits) errors.payer_card_last_digits = M.digitsRequired
  else if (!/^\d{4}$/.test(digits)) errors.payer_card_last_digits = M.digitsInvalid
  const paidAt = paidAtError(input.paidAt, now)
  if (paidAt) errors.paid_at = paidAt
  if (input.destinationCard === null) errors.destination_card = M.cardRequired
  if (input.bankReference.trim().length > BANK_REFERENCE_MAX) {
    errors.bank_reference = M.referenceLong
  }
  return errors
}
