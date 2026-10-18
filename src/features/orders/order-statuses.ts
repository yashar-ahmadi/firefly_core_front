import type { OrderStatus } from '@/lib/api/types/order'
import type { OrderStatusGroup } from '@/lib/api/types/order-detail'

// The order statuses as the storefront knows them (order digest §6.1), in ONE place: the path an
// order goes through, its endings, and the account's pile (tab) for each status. What a status is
// called is the API's (`status_display`, a step's `label`); the names below are only for steps of
// a bar the page derives itself (tracking), which the API names only for the status the order is
// in now (§2.1's `status_display` values). Statuses the code does not know are possible (a new
// one on the server): every helper answers them with null or false, never throws. Status can
// move backwards (a rejected receipt, an operator's correction). Pure.

/** Every stage an order can pass on its way to the customer, in order (order/services/progress.py). */
export const FORWARD_PATH = [
  'awaiting_payment',
  'awaiting_review',
  'processing',
  'packing',
  'sent',
  'delivered',
] as const satisfies readonly OrderStatus[]

/** The ways an order ends (`is_terminal`). */
export const TERMINAL_STATUSES = ['cancelled', 'returned'] as const satisfies readonly OrderStatus[]

/** The account's pile (tab) of each status (§6.1); the tabs' own labels come from the summary. */
export const STATUS_GROUPS: Readonly<Record<OrderStatus, OrderStatusGroup>> = {
  awaiting_payment: 'awaiting_payment',
  awaiting_review: 'in_progress',
  processing: 'in_progress',
  packing: 'in_progress',
  sent: 'in_progress',
  delivered: 'delivered',
  cancelled: 'cancelled',
  returned: 'returned',
}

/** The name of a step the API does not name here (the API's `status_display` of that status). */
export const STEP_NAMES: Readonly<Record<OrderStatus, string>> = {
  awaiting_payment: 'در انتظار پرداخت',
  awaiting_review: 'در انتظار بررسی',
  processing: 'در حال انجام',
  packing: 'بسته\u{200C}بندی',
  sent: 'ارسال شده',
  delivered: 'تکمیل شده',
  cancelled: 'لغو شده',
  returned: 'مسترد شده',
}

export function isOrderStatus(value: string): value is OrderStatus {
  return Object.hasOwn(STATUS_GROUPS, value)
}

export function isTerminalStatus(value: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(value)
}

/** The pile of `status`, or null for a status the code does not know. */
export function groupOf(status: string): OrderStatusGroup | null {
  return isOrderStatus(status) ? STATUS_GROUPS[status] : null
}
