import { describe, expect, it } from 'vitest'
import {
  CARDS_CHANGED,
  receiptRefusal,
  UPLOAD_RETRY,
} from '@/features/payment/card-transfer/receipt-errors'
import { RECEIPT_MESSAGES as M } from '@/features/payment/card-transfer/validate-receipt'
import { ApiError, NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import live from '../../fixtures/card-transfer-receipt-refusals.json'

// What every refusal of the receipt upload (order digest §3.2.8, §8.4) does on the page, from
// the bodies the dev API sent (captured live): the picture's under the picture, a field's under
// its field (several at once), a card gone → the cards read again and chosen again, a second
// receipt → the outcome, an attempt no longer open → a new one, a wait, the BFF's streamed upload
// met a session refresh → «دوباره تلاش کنید» with the form kept.

type Body = { code: number; data: Record<string, unknown> }
const fromLive = (body: Body) => ApiError.fromBody(body.code, body as Record<string, unknown>)

describe('receiptRefusal', () => {
  it('several field errors at once, each under its field; a card that does not exist: re-read the cards', () => {
    const refusal = receiptRefusal(fromLive(live.validation))
    expect(refusal).toEqual({
      kind: 'fields',
      reloadCards: true,
      errors: {
        payer_name: 'این مقدار لازم است.',
        payer_card_last_digits: 'کد باید دقیقاً ۴ رقم باشد.',
        paid_at: 'زمان واریز نمی\u{200C}تواند در آینده باشد.',
        destination_card: CARDS_CHANGED,
      },
    })
  })

  it.each([
    [
      'image_invalid (a GIF)',
      live.image_invalid,
      'فایل ارسالی یک تصویر معتبر (JPEG، PNG یا WEBP) نیست.',
    ],
    [
      'image_too_small',
      live.image_too_small,
      'ابعاد تصویر رسید کمتر از حد مجاز (۳۰۰ در ۳۰۰ پیکسل) است.',
    ],
    ['image_too_large (413)', live.image_too_large, M.imageSize],
    ['invalid_image (bytes that are no picture)', live.invalid_image, M.imageDecode],
  ])('%s: under the picture', (_, body, message) => {
    expect(receiptRefusal(fromLive(body as Body))).toEqual({
      kind: 'fields',
      reloadCards: false,
      errors: { image: message },
    })
  })

  it('the BFF’s own 413 (over its 6 MiB): under the picture', () => {
    const error = new ApiError({ status: 413, code: 'request_too_large' })
    expect(receiptRefusal(error)).toMatchObject({ kind: 'fields', errors: { image: M.imageSize } })
  })

  it('an inactive card (payment_destination_card_invalid): re-read the cards, choose again', () => {
    const error = new ApiError({
      status: 400,
      code: 'payment_destination_card_invalid',
      detail: 'کارت مقصد انتخاب‌شده معتبر نیست.',
    })
    expect(receiptRefusal(error)).toEqual({
      kind: 'fields',
      reloadCards: true,
      errors: { destination_card: CARDS_CHANGED },
    })
  })

  it('a receipt already sent (409): the outcome', () => {
    expect(receiptRefusal(fromLive(live.already_submitted))).toEqual({ kind: 'submitted' })
  })

  it('the attempt is no longer open (payment_target_invalid): a new one', () => {
    expect(receiptRefusal(fromLive(live.target_invalid))).toEqual({ kind: 'closed' })
  })

  it('not found (404) and another account’s (403): the calm page', () => {
    expect(receiptRefusal(fromLive(live.not_found))).toEqual({
      kind: 'refused',
      reason: 'not_found',
    })
    expect(receiptRefusal(new ApiError({ status: 403, code: 'payment_forbidden' }))).toEqual({
      kind: 'refused',
      reason: 'forbidden',
    })
  })

  it('a 429 (10 an hour): wait for retry_after', () => {
    const error = new ApiError({ status: 429, code: 'throttled', retryAfter: 1200 })
    expect(receiptRefusal(error)).toEqual({ kind: 'throttled', retryAfter: 1200 })
  })

  it('503 upload_retry (a session refreshed on the way): «دوباره تلاش کنید», the form kept', () => {
    const error = new ApiError({ status: 503, code: 'upload_retry' })
    expect(receiptRefusal(error)).toEqual({ kind: 'retry', message: UPLOAD_RETRY, session: false })
    expect(UPLOAD_RETRY).toContain('دوباره تلاش کنید')
  })

  it('no answer, or a refresh that could not be had: try again', () => {
    for (const error of [
      ApiError.network(),
      ApiError.nonJson(502),
      new ApiError({ status: 503, code: 'session_refresh_unavailable' }),
    ]) {
      expect(receiptRefusal(error)).toEqual({
        kind: 'retry',
        message: NETWORK_ERROR_DETAIL,
        session: false,
      })
    }
  })

  it('the session gone (401): ended, and the press can be made again as a guest', () => {
    const error = new ApiError({ status: 401, code: 'not_authenticated' })
    expect(receiptRefusal(error)).toEqual({ kind: 'retry', message: UPLOAD_RETRY, session: true })
  })

  it('anything else: its own sentence', () => {
    const error = new ApiError({ status: 500, code: 'server_error', detail: 'خطای سرور' })
    expect(receiptRefusal(error)).toEqual({ kind: 'other', message: 'خطای سرور' })
  })
})
