import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  placeOrder,
  PlacementError,
  TotalChangedError,
  type PlacementProblem,
} from '@/features/checkout/place-order'
import { ApiError } from '@/lib/api/errors'
import receiverInvalid from '../../fixtures/order-place-receiver-invalid.json'
import receiverRequired from '../../fixtures/order-place-receiver-required.json'
import totalChanged from '../../fixtures/order-place-total-changed.json'
import { placement } from '../payment/fixtures'

// `POST order/place/` (order digest §3.1.1, §8.1): the body (a guest's receiver, never one for
// a cart with a saved address; the note; `expected_total`), the placement key as the
// Idempotency-Key, 201 new and 200 a replay, and every refusal turned into what the page does
// about it (`PlacementError.problem`); `order_total_changed` as its own `TotalChangedError`.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const RECEIVER = {
  first_name: 'آزمون',
  last_name: 'ثبت',
  mobile: '09120000301',
  address: 'خیابان آزمون، کوچهٔ یک',
  postal_code: '1234567890',
}

const body = (status: number, code: string, extra: Record<string, unknown> = {}, attr = null) =>
  ApiError.fromBody(status, {
    msg: '',
    code: status,
    data: { type: 'client_error', errors: [{ code, detail: `detail of ${code}`, attr }], ...extra },
  })

const refuse = (error: unknown) => mocks.bffFetch.mockRejectedValueOnce(error)
const guest = () =>
  placeOrder({
    isGuest: true,
    receiver: RECEIVER,
    customerMobile: '09120000302',
    note: 'زنگ نزنید',
    expectedTotal: 1_049_000,
    key: 'key-1',
  })

async function problemOf(promise: Promise<unknown>): Promise<PlacementError> {
  const error = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(PlacementError)
  return error as PlacementError
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('placeOrder', () => {
  it('a guest: the receiver, the buyer’s mobile, the note and expected_total, with the key', async () => {
    mocks.bffFetch.mockResolvedValueOnce({ data: placement(), msg: '', status: 201 })
    const placed = await guest()
    expect(placed).toEqual({ order: placement(), replayed: false })
    expect(mocks.bffFetch).toHaveBeenCalledWith('order/place/', {
      method: 'POST',
      idempotencyKey: 'key-1',
      body: {
        receiver: RECEIVER,
        customer_mobile: '09120000302',
        customer_note: 'زنگ نزنید',
        expected_total: 1_049_000,
      },
    })
  })

  it('signed in (a saved address): never a receiver, never the buyer’s mobile; an empty note is left out', async () => {
    mocks.bffFetch.mockResolvedValueOnce({ data: placement(), msg: '', status: 200 })
    const placed = await placeOrder({
      isGuest: false,
      receiver: RECEIVER,
      customerMobile: '09120000302',
      note: '  ',
      expectedTotal: 1_049_000,
      key: 'key-2',
    })
    // 200: the order a lost answer had already placed.
    expect(placed.replayed).toBe(true)
    expect(mocks.bffFetch.mock.calls[0]![1].body).toEqual({ expected_total: 1_049_000 })
  })

  it('maps 409 order_total_changed to TotalChangedError', async () => {
    refuse(ApiError.fromBody(409, totalChanged))
    const error = await problemOf(guest())
    expect(error).toBeInstanceOf(TotalChangedError)
    expect(error.problem).toBe('total_changed')
    expect(error.detail).toBe('مبلغ سفارش تغییر کرده است. لطفاً سبد خرید را دوباره بررسی کنید.')
  })

  it.each<[string, number, PlacementProblem]>([
    ['order_cart_empty', 409, 'cart_empty'],
    ['order_destination_required', 409, 'destination'],
    ['order_shipping_method_required', 409, 'shipping'],
    ['order_shipping_method_unavailable', 409, 'shipping'],
    ['order_receiver_required', 400, 'receiver'],
    ['order_receiver_forbidden', 400, 'receiver_forbidden'],
    ['order_coupon_no_longer_valid', 409, 'cart_refresh'],
    ['coupon_usage_limit_reached', 400, 'cart_refresh'],
    ['coupon_user_limit_reached', 400, 'cart_refresh'],
    ['order_out_of_stock', 409, 'cart_refresh'],
    ['order_stock_reservation_failed', 409, 'cart_refresh'],
    ['order_item_unavailable', 409, 'items_unavailable'],
    ['order_cart_changed', 409, 'cart_changed'],
    ['order_unpaid_limit_reached', 409, 'unpaid_limit'],
    ['order_idempotency_key_invalid', 400, 'invalid_key'],
    ['cart_not_found', 404, 'cart_gone'],
  ])('%s (%i) → %s, with the API’s detail', async (code, status, problem) => {
    refuse(body(status, code))
    const error = await problemOf(guest())
    expect(error.problem).toBe(problem)
    expect(error.detail).toBe(`detail of ${code}`)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
  })

  it('order_item_unavailable carries data.items; order_cart_changed its adjustments', async () => {
    const items = [
      {
        variant_id: 10123,
        product_name: 'قهوه',
        issue: 'insufficient_stock',
        available_quantity: 1,
      },
    ]
    refuse(body(409, 'order_item_unavailable', { items }))
    expect((await problemOf(guest())).items).toEqual(items)
    const adjustments = [
      { variant_id: 10123, product_name: 'قهوه', requested: 3, applied: 2, was_dropped: false },
    ]
    refuse(body(409, 'order_cart_changed', { adjustments }))
    expect((await problemOf(guest())).adjustments).toEqual(adjustments)
  })

  it('the API’s receiver checks map to the guest form’s fields (nested attrs)', async () => {
    refuse(ApiError.fromBody(400, receiverInvalid))
    const error = await problemOf(guest())
    expect(error.problem).toBe('receiver')
    expect(error.fields).toEqual({
      customerMobile: 'یک شماره تماس معتبر وارد نمایید.',
      mobile:
        'شماره\u{0654} موبایل ایران را وارد کنید؛ تلفن ثابت و شماره\u{0654} خارجی پذیرفته نمی\u{200C}شود.',
      postalCode: 'کد پستی باید دقیقاً ۱۰ رقم باشد.',
    })
    refuse(ApiError.fromBody(400, receiverRequired))
    expect((await problemOf(guest())).problem).toBe('receiver')
  })

  it('a note over the limit is the note’s problem', async () => {
    refuse(
      ApiError.fromBody(400, {
        msg: '',
        code: 400,
        data: {
          type: 'validation_error',
          errors: [{ code: 'max_length', detail: 'بلند است.', attr: 'customer_note' }],
        },
      }),
    )
    const error = await problemOf(guest())
    expect(error.problem).toBe('note')
    expect(error.detail).toBe('بلند است.')
  })

  it.each(['order_money_snapshot_invalid', 'order_code_unavailable'])(
    '500 %s: sent once more with the same key, then support',
    async (code) => {
      refuse(body(500, code))
      mocks.bffFetch.mockResolvedValueOnce({ data: placement(), msg: '', status: 201 })
      expect((await guest()).order.order_code).toBe('5592580094')
      expect(mocks.bffFetch.mock.calls.map(([, init]) => init.idempotencyKey)).toEqual([
        'key-1',
        'key-1',
      ])
      mocks.bffFetch.mockReset()
      refuse(body(500, code))
      refuse(body(500, code))
      const error = await problemOf(guest())
      expect(error.problem).toBe('server')
      expect(mocks.bffFetch).toHaveBeenCalledTimes(2)
    },
  )

  it('503 guest_checkout off, 429, a session gone, and anything else', async () => {
    refuse(
      new ApiError({
        status: 503,
        code: 'feature_disabled',
        detail: 'خرید مهمان بسته است.',
        feature: 'guest_checkout',
      }),
    )
    expect((await problemOf(guest())).problem).toBe('guest_closed')
    refuse(
      new ApiError({ status: 429, code: 'throttled', detail: 'کمی صبر کنید.', retryAfter: 12 }),
    )
    const throttled = await problemOf(guest())
    expect([throttled.problem, throttled.retryAfter]).toEqual(['throttled', 12])
    refuse(new ApiError({ status: 401, code: 'token_not_valid', detail: 'x' }))
    expect((await problemOf(guest())).problem).toBe('session')
    refuse(ApiError.network())
    const network = await problemOf(guest())
    expect(network.problem).toBe('other')
    expect(network.detail).toBe('ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.')
  })
})
