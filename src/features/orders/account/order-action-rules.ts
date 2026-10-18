import type { OrderSummaryBase } from '@/lib/api/types/order-detail'

// Which of an order's own actions the account offers (order digest §6.1, §6.3), from the API's
// flags alone (an unknown status included: nothing is guessed from the status but the one rule
// the digest gives). «خرید دوباره» and «کد QR» are always there; they are not decided here. Pure.

export interface OrderActionSet {
  /** «پرداخت»: it owes online money now (the deadline is the server's to check). */
  pay: boolean
  /**
   * «تأیید سفارش»: a pure pay-on-delivery order awaiting its confirmation (nothing online, so not
   * payable; its link still there): the `pay_on_delivery` intent on its uuid (§0 #6).
   */
  confirm: boolean
  /** «لغو سفارش»: only while it awaits payment (`can_cancel`). */
  cancel: boolean
}

export function orderActions(
  order: Pick<OrderSummaryBase, 'status' | 'is_payable' | 'payment_url' | 'can_cancel'>,
): OrderActionSet {
  return {
    pay: order.is_payable,
    confirm: order.status === 'awaiting_payment' && !order.is_payable && order.payment_url !== null,
    cancel: order.can_cancel,
  }
}
