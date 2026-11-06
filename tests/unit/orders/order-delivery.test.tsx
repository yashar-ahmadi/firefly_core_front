import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderDelivery } from '@/features/orders/account/order-delivery'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import processingCod from '../../fixtures/account-order-processing-cod.json'

// An order's delivery block (order digest §6.4): a pay-on-delivery order says its share is paid to
// the courier, but not once it is cancelled (its door collection is cancelled with it,
// BACKEND-ISSUES X2: nothing will be collected at its door).

const order = (changes: Partial<OrderDetail> = {}): OrderDetail => ({
  ...(structuredClone(processingCod).data as unknown as OrderDetail),
  ...changes,
})
const AT_DOOR = /سهم پرداخت هنگام تحویل را به مأمور ارسال می‌پردازید/

describe('OrderDelivery', () => {
  it('a pay-on-delivery order on its way: the courier collects its share', () => {
    render(<OrderDelivery order={order()} />)
    expect(screen.getByText('پرداخت در محل')).toBeVisible()
    expect(screen.getByText(AT_DOOR)).toBeVisible()
  })

  it.each([
    ['cash on delivery', { cash_on_delivery: true }],
    ['the freight at the door (پس‌کرایه)', { freight_paid_by_recipient: true }],
  ])('cancelled: no «pay at the door» (%s)', (_, changes) => {
    render(<OrderDelivery order={order({ status: 'cancelled', ...changes })} />)
    expect(screen.queryByText('پرداخت در محل')).not.toBeInTheDocument()
    expect(screen.queryByText(AT_DOOR)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/هزینهٔ ارسال را گیرنده هنگام تحویل می‌پردازد/),
    ).not.toBeInTheDocument()
  })
})
