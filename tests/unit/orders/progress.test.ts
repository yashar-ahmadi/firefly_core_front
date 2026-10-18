import { describe, expect, it } from 'vitest'
import { progressFromTracking } from '@/features/orders/progress'
import type { OrderTrackingResult } from '@/lib/api/types/order-detail'
import live from '../../fixtures/order-track.json'

// The tracking answer has no progress steps (order digest §2 `OrderTrackingResult`, by design):
// the page derives them from the status and the milestone stamps, with the backend's own rules
// (order/services/progress.py): completed up to the stage the order is in, that one current, the
// rest upcoming and never dated; «در انتظار بررسی» only while the order is in it; «ارسال شده» left
// out for an order delivered (or returned) without a dispatch (a counter sale); a cancelled or
// returned order cut after the furthest stage its stamps prove, then its ending. Statuses can move
// backwards. The tracking answer has no `confirmed_at`, so «در حال انجام» is never dated here.

const base = live.delivered.body.data as OrderTrackingResult
const result = (changes: Partial<OrderTrackingResult>): OrderTrackingResult => ({
  ...base,
  paid_at: null,
  packed_at: null,
  dispatched_at: null,
  delivered_at: null,
  cancelled_at: null,
  returned_at: null,
  postal_tracking_code: null,
  ...changes,
})
const shape = (r: OrderTrackingResult) =>
  progressFromTracking(r).steps.map((step) => `${step.key}:${step.state}`)

const PLACED = base.placed_at
const T = (day: number) => `2026-08-${String(day).padStart(2, '0')}T10:00:00+03:30`

describe('progressFromTracking: a live order', () => {
  it.each<[string, Partial<OrderTrackingResult>, string[]]>([
    [
      'awaiting payment',
      { status: 'awaiting_payment', status_display: 'در انتظار پرداخت' },
      [
        'awaiting_payment:current',
        'processing:upcoming',
        'packing:upcoming',
        'sent:upcoming',
        'delivered:upcoming',
      ],
    ],
    [
      'a receipt under review: its step only now',
      { status: 'awaiting_review', status_display: 'در انتظار بررسی' },
      [
        'awaiting_payment:completed',
        'awaiting_review:current',
        'processing:upcoming',
        'packing:upcoming',
        'sent:upcoming',
        'delivered:upcoming',
      ],
    ],
    [
      'processing',
      { status: 'processing', status_display: 'در حال انجام', paid_at: T(9) },
      [
        'awaiting_payment:completed',
        'processing:current',
        'packing:upcoming',
        'sent:upcoming',
        'delivered:upcoming',
      ],
    ],
    [
      'sent',
      { status: 'sent', status_display: 'ارسال شده', packed_at: T(9), dispatched_at: T(10) },
      [
        'awaiting_payment:completed',
        'processing:completed',
        'packing:completed',
        'sent:current',
        'delivered:upcoming',
      ],
    ],
  ])('%s', (_, changes, steps) => {
    const view = progressFromTracking(result(changes))
    expect(view.terminal).toBe(false)
    expect(view.steps.map((step) => `${step.key}:${step.state}`)).toEqual(steps)
    expect(view.steps.filter((step) => step.state === 'current')).toHaveLength(1)
  })

  it('dates each reached step from its stamp; upcoming ones and «در حال انجام» never', () => {
    const view = progressFromTracking(
      result({ status: 'sent', paid_at: T(8), packed_at: T(9), dispatched_at: T(10) }),
    )
    expect(view.steps.map((step) => step.reached_at)).toEqual([PLACED, null, T(9), T(10), null])
  })

  it('the current step says the API’s status_display; the others their step names', () => {
    const view = progressFromTracking(
      result({ status: 'sent', status_display: 'تحویل پست شد', dispatched_at: T(10) }),
    )
    expect(view.steps.map((step) => step.label)).toEqual([
      'در انتظار پرداخت',
      'در حال انجام',
      'بسته\u{200C}بندی',
      'تحویل پست شد',
      'تکمیل شده',
    ])
  })

  it('moved back (sent → packing, its dispatch stamp cleared): packing current, sent upcoming', () => {
    expect(shape(result({ status: 'packing', packed_at: T(9) }))).toEqual([
      'awaiting_payment:completed',
      'processing:completed',
      'packing:current',
      'sent:upcoming',
      'delivered:upcoming',
    ])
  })

  it('a stamp left on a step the order is not past is not shown as a date', () => {
    const view = progressFromTracking(
      result({ status: 'packing', packed_at: T(9), dispatched_at: T(10), delivered_at: T(11) }),
    )
    expect(view.steps.slice(3).map((step) => [step.state, step.reached_at])).toEqual([
      ['upcoming', null],
      ['upcoming', null],
    ])
  })

  it('a rejected receipt sends the order back to awaiting payment: no review step any more', () => {
    expect(shape(result({ status: 'awaiting_payment' }))[0]).toBe('awaiting_payment:current')
    expect(shape(result({ status: 'awaiting_payment' }))).not.toContain('awaiting_review:completed')
  })

  it('delivered without a dispatch (a counter sale): no «ارسال شده» step; with one, it has it', () => {
    expect(shape(result({ status: 'delivered', packed_at: T(9), delivered_at: T(11) }))).toEqual([
      'awaiting_payment:completed',
      'processing:completed',
      'packing:completed',
      'delivered:current',
    ])
    expect(
      shape(result({ status: 'delivered', dispatched_at: T(10), delivered_at: T(11) })),
    ).toContain('sent:completed')
  })
})

describe('progressFromTracking: an order that ended', () => {
  it.each<[string, Partial<OrderTrackingResult>, string[]]>([
    [
      'cancelled before any payment',
      { status: 'cancelled', status_display: 'لغو شده', cancelled_at: T(9) },
      ['awaiting_payment:completed', 'cancelled:current'],
    ],
    [
      'cancelled after payment',
      { status: 'cancelled', paid_at: T(8), cancelled_at: T(9) },
      ['awaiting_payment:completed', 'processing:completed', 'cancelled:current'],
    ],
    [
      'cancelled while packed',
      { status: 'cancelled', paid_at: T(8), packed_at: T(9), cancelled_at: T(10) },
      [
        'awaiting_payment:completed',
        'processing:completed',
        'packing:completed',
        'cancelled:current',
      ],
    ],
    [
      'returned in transit',
      { status: 'returned', packed_at: T(9), dispatched_at: T(10), returned_at: T(12) },
      [
        'awaiting_payment:completed',
        'processing:completed',
        'packing:completed',
        'sent:completed',
        'returned:current',
      ],
    ],
  ])('%s: cut after the furthest stage, then the ending', (_, changes, steps) => {
    const view = progressFromTracking(result(changes))
    expect(view.terminal).toBe(true)
    expect(view.steps.map((step) => `${step.key}:${step.state}`)).toEqual(steps)
  })

  it('the ending is dated by its own stamp and named by the API', () => {
    const view = progressFromTracking(
      result({ status: 'cancelled', status_display: 'لغو شده', cancelled_at: T(9) }),
    )
    expect(view.steps.at(-1)).toEqual({
      key: 'cancelled',
      label: 'لغو شده',
      state: 'current',
      reached_at: T(9),
    })
  })

  it('cancelled, then restored (cancelled → processing): a live bar again', () => {
    expect(shape(result({ status: 'processing', paid_at: T(8) }))).toContain('processing:current')
  })
})

describe('progressFromTracking: a status it does not know', () => {
  it('one current step in the API’s words, nothing guessed around it', () => {
    const view = progressFromTracking(
      result({ status: 'on_hold' as OrderTrackingResult['status'], status_display: 'معلق' }),
    )
    expect(view).toEqual({
      terminal: false,
      steps: [{ key: 'on_hold', label: 'معلق', state: 'current', reached_at: null }],
    })
  })
})
