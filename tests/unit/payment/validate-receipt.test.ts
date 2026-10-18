import { describe, expect, it } from 'vitest'
import {
  MAX_RECEIPT_BYTES,
  normalizeLastDigits,
  PAID_AT_SKEW_MS,
  RECEIPT_MESSAGES as M,
  validateReceipt,
  type ReceiptInput,
} from '@/features/payment/card-transfer/validate-receipt'

// The receipt's checks before it is sent (order digest §5.7 step 3; Review Focus #4): the image's
// type, size and dimensions, the card's last four digits (Persian and Arabic digits too), the
// transfer's time (never in the future), the card it went to; each in Persian, under its field
// (keyed by the API's own field names, so the server's answers land in the same places).

const NOW = new Date('2026-10-18T10:00:00+03:30')

const valid = (changes: Partial<ReceiptInput> = {}): ReceiptInput => ({
  image: { type: 'image/png', size: 200_000, probe: { ok: true, width: 1080, height: 1920 } },
  payerName: 'سارا احمدی',
  lastDigits: '1234',
  paidAt: '2026-10-18T09:30:00+03:30',
  destinationCard: 10001,
  bankReference: '',
  ...changes,
})

const image = (changes: Partial<NonNullable<ReceiptInput['image']>>) => ({
  image: { ...valid().image!, ...changes },
})

describe('validateReceipt', () => {
  it('passes a complete receipt', () => {
    expect(validateReceipt(valid(), NOW)).toEqual({})
  })

  it('a 6 MiB file: «حجم تصویر نباید بیشتر از ۵ مگابایت باشد»', () => {
    const errors = validateReceipt(valid(image({ size: 6 * 1024 * 1024 })), NOW)
    expect(errors.image).toBe('حجم تصویر نباید بیشتر از ۵ مگابایت باشد')
    // Exactly 5 MiB is the limit, not over it.
    expect(validateReceipt(valid(image({ size: MAX_RECEIPT_BYTES })), NOW).image).toBeUndefined()
    expect(validateReceipt(valid(image({ size: MAX_RECEIPT_BYTES + 1 })), NOW).image).toBe(
      M.imageSize,
    )
  })

  it('image/gif is refused (only JPEG, PNG and WEBP)', () => {
    expect(validateReceipt(valid(image({ type: 'image/gif' })), NOW).image).toBe(M.imageType)
    expect(validateReceipt(valid(image({ type: 'image/heic' })), NOW).image).toBe(M.imageType)
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateReceipt(valid(image({ type })), NOW).image).toBeUndefined()
    }
  })

  it('no type, or one the browser names oddly: the bytes decide (they say JPEG, PNG or WEBP)', () => {
    for (const type of [
      '',
      'application/octet-stream',
      'image/jpg',
      'image/pjpeg',
      'image/x-png',
    ]) {
      expect(validateReceipt(valid(image({ type })), NOW).image).toBeUndefined()
      expect(
        validateReceipt(valid(image({ type, probe: { ok: false, reason: 'format' } })), NOW).image,
      ).toBe(M.imageType)
    }
  })

  it('a file that only claims to be a picture (its bytes say otherwise) is refused by type', () => {
    expect(
      validateReceipt(valid(image({ probe: { ok: false, reason: 'format' } })), NOW).image,
    ).toBe(M.imageType)
  })

  it('a picture that cannot be decoded: «فایل تصویر معتبر نیست»', () => {
    expect(
      validateReceipt(valid(image({ probe: { ok: false, reason: 'decode' } })), NOW).image,
    ).toBe('فایل تصویر معتبر نیست')
  })

  it('the dimensions: at least 300 × 300, at most 6000 a side, at most 40 megapixels', () => {
    const sized = (width: number, height: number) =>
      validateReceipt(valid(image({ probe: { ok: true, width, height } })), NOW).image
    expect(sized(299, 1000)).toBe(M.imageSmall)
    expect(sized(1000, 299)).toBe(M.imageSmall)
    expect(sized(300, 300)).toBeUndefined()
    expect(sized(6001, 1000)).toBe(M.imageSide)
    expect(sized(1000, 6001)).toBe(M.imageSide)
    expect(sized(6000, 6000)).toBeUndefined()
    // Over 40 megapixels (each side over 6000 too: 36 MP is the most 6000 × 6000 allows), said as such.
    expect(sized(8000, 6000)).toBe(M.imagePixels)
    expect(sized(7000, 7000)).toBe(M.imagePixels)
  })

  it('no picture chosen', () => {
    expect(validateReceipt(valid({ image: null }), NOW).image).toBe(M.imageRequired)
  })

  it('last digits «۱۲۳۴» normalise to 1234 and pass; Arabic digits too', () => {
    expect(normalizeLastDigits('۱۲۳۴')).toBe('1234')
    expect(normalizeLastDigits('١٢٣٤')).toBe('1234')
    expect(normalizeLastDigits(' 12 34 ')).toBe('1234')
    expect(validateReceipt(valid({ lastDigits: '۱۲۳۴' }), NOW)).toEqual({})
  })

  it('last digits: exactly four digits', () => {
    expect(validateReceipt(valid({ lastDigits: '' }), NOW).payer_card_last_digits).toBe(
      M.digitsRequired,
    )
    for (const digits of ['123', '12345', '12a4', '۱۲۳']) {
      expect(validateReceipt(valid({ lastDigits: digits }), NOW).payer_card_last_digits).toBe(
        M.digitsInvalid,
      )
    }
  })

  it('a paid_at in the future is refused; the clock is allowed 5 minutes of skew', () => {
    expect(PAID_AT_SKEW_MS).toBe(5 * 60_000)
    expect(validateReceipt(valid({ paidAt: '2026-10-18T11:00:00+03:30' }), NOW).paid_at).toBe(
      'زمان واریز نمی\u{200C}تواند در آینده باشد',
    )
    expect(
      validateReceipt(valid({ paidAt: '2026-10-18T10:05:00+03:30' }), NOW).paid_at,
    ).toBeUndefined()
    expect(validateReceipt(valid({ paidAt: '2026-10-18T10:06:00+03:30' }), NOW).paid_at).toBe(
      M.paidAtFuture,
    )
    expect(validateReceipt(valid({ paidAt: '' }), NOW).paid_at).toBe(M.paidAtRequired)
  })

  it('the destination card is required', () => {
    expect(validateReceipt(valid({ destinationCard: null }), NOW).destination_card).toBe(
      M.cardRequired,
    )
  })

  it('the payer’s name is required (the API requires it), at most 200 characters', () => {
    expect(validateReceipt(valid({ payerName: '   ' }), NOW).payer_name).toBe(M.payerRequired)
    expect(validateReceipt(valid({ payerName: 'ن'.repeat(201) }), NOW).payer_name).toBe(M.payerLong)
  })

  it('the bank reference is optional, at most 100 characters', () => {
    expect(validateReceipt(valid({ bankReference: '۱۲۳۴۵۶' }), NOW)).toEqual({})
    expect(validateReceipt(valid({ bankReference: '1'.repeat(101) }), NOW).bank_reference).toBe(
      M.referenceLong,
    )
  })

  it('reports every field at once', () => {
    const errors = validateReceipt(
      {
        image: null,
        payerName: '',
        lastDigits: '',
        paidAt: '',
        destinationCard: null,
        bankReference: '',
      },
      NOW,
    )
    expect(Object.keys(errors).sort()).toEqual([
      'destination_card',
      'image',
      'paid_at',
      'payer_card_last_digits',
      'payer_name',
    ])
  })
})
