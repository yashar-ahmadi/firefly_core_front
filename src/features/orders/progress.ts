import type { OrderStatus } from '@/lib/api/types/order'
import type { OrderTrackingResult, Progress } from '@/lib/api/types/order-detail'
import { FORWARD_PATH, isOrderStatus, isTerminalStatus, STEP_NAMES } from './order-statuses'

// An order's progress bar as `OrderProgress` draws it: the steps in order, each completed,
// current (exactly one) or upcoming, with when it was reached. The account's order gives the
// server's own bar (`progressFromServer`, order digest §6.2: drawn exactly as sent). Tracking
// gives none (§2 `OrderTrackingResult`, by design), so `progressFromTracking` derives it from the
// status and the milestone stamps with the backend's own rules (order/services/progress.py):
// - live: completed up to the stage the order is in, that one current, the rest upcoming and
//   never dated (a stamp left on a step not reached is not shown);
// - «در انتظار بررسی» only while the order is in it (whether it went through review is not told);
// - «ارسال شده» left out for an order delivered or returned without a dispatch (only a counter
//   sale gets there that way; the channel is not told, so a counter sale still being prepared
//   shows the step);
// - cancelled or returned (`terminal`): the path cut after the furthest stage its stamps prove
//   (paying proves «در حال انجام»), then the ending. So a pay-on-delivery order confirmed
//   without a payment (`paid_at` null) and cancelled while still «در حال انجام» (before packing)
//   derives to «در انتظار پرداخت» → «لغو شده»: nothing in tracking proves it was confirmed (no
//   `confirmed_at`), though the server's bar shows «در حال انجام» between them;
// - «در حال انجام» is never dated (tracking has no `confirmed_at`; `paid_at` is not the same moment);
// - a status this code does not know: one current step in the API's words, nothing guessed.
// The current step is named by the API (`status_display`); the others by STEP_NAMES. Pure.

export type ProgressState = 'completed' | 'current' | 'upcoming'

export interface ProgressStepView {
  /** The step's status (unknown ones too). */
  key: string
  label: string
  state: ProgressState
  reached_at: string | null
}

export interface ProgressView {
  steps: ProgressStepView[]
  /** The order ended (cancelled, returned): its last step is the ending. */
  terminal: boolean
}

/** The server's bar (`OrderDetail.progress`, `OrderListItem.progress`), as it came. */
export function progressFromServer(progress: Progress): ProgressView {
  return {
    terminal: progress.is_terminal,
    steps: progress.steps.map((step) => ({
      key: step.status,
      label: step.label,
      state: step.state,
      reached_at: step.reached_at,
    })),
  }
}

type Stamp = Exclude<keyof OrderTrackingResult, 'order_code' | 'status' | 'status_display'>

/** The stamp that says when the order reached each stage, where tracking gives one. */
const REACHED_AT: Partial<Record<OrderStatus, Stamp>> = {
  awaiting_payment: 'placed_at',
  packing: 'packed_at',
  sent: 'dispatched_at',
  delivered: 'delivered_at',
  cancelled: 'cancelled_at',
  returned: 'returned_at',
}

const stampOf = (result: OrderTrackingResult, stage: OrderStatus): string | null => {
  const field = REACHED_AT[stage]
  const value = field ? result[field] : null
  return typeof value === 'string' ? value : null
}

/** Whether a terminal order's stamps prove it reached `stage`. */
function wasReached(result: OrderTrackingResult, stage: OrderStatus): boolean {
  if (stage === 'awaiting_payment') return true
  if (stage === 'processing') {
    return Boolean(
      result.paid_at || result.packed_at || result.dispatched_at || result.delivered_at,
    )
  }
  return stampOf(result, stage) !== null
}

/** The stages this order goes through, before any ending. */
function pathOf(result: OrderTrackingResult): OrderStatus[] {
  const handedOver =
    (result.status === 'delivered' || result.status === 'returned') && !result.dispatched_at
  return FORWARD_PATH.filter(
    (stage) =>
      (stage !== 'awaiting_review' || result.status === 'awaiting_review') &&
      (stage !== 'sent' || !handedOver),
  )
}

export function progressFromTracking(result: OrderTrackingResult): ProgressView {
  const label = (stage: OrderStatus) =>
    stage === result.status ? result.status_display : STEP_NAMES[stage]
  const step = (stage: OrderStatus, state: ProgressState): ProgressStepView => ({
    key: stage,
    label: label(stage),
    state,
    reached_at: state === 'upcoming' ? null : stampOf(result, stage),
  })
  const { status } = result
  if (!isOrderStatus(status)) {
    return {
      terminal: false,
      steps: [{ key: status, label: result.status_display, state: 'current', reached_at: null }],
    }
  }
  const path = pathOf(result)
  if (isTerminalStatus(status)) {
    let furthest = 0
    path.forEach((stage, index) => {
      if (wasReached(result, stage)) furthest = index
    })
    return {
      terminal: true,
      steps: [
        ...path.slice(0, furthest + 1).map((stage) => step(stage, 'completed')),
        step(status, 'current'),
      ],
    }
  }
  const current = path.indexOf(status)
  return {
    terminal: false,
    steps: path.map((stage, index) =>
      step(stage, index < current ? 'completed' : index === current ? 'current' : 'upcoming'),
    ),
  }
}
