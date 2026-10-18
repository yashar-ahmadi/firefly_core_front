import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderProgress } from '@/features/orders/components/order-progress'
import { progressFromServer, progressFromTracking } from '@/features/orders/progress'
import type { OrderDetail, OrderTrackingResult } from '@/lib/api/types/order-detail'
import delivered from '../../fixtures/order-detail-delivered.json'
import live from '../../fixtures/order-track.json'

// The progress view (order digest §6.2): a list of the steps, in order, each with its state said
// in words (never by colour alone) and the date it was reached; the current step marked as such;
// an order that ended (cancelled, returned) ends in a step drawn and said as the ending. It draws
// exactly the steps it is given: the server's (the account's order, Task 8) or the ones tracking
// derives (progressFromTracking).

const sent: OrderTrackingResult = {
  ...(live.delivered.body.data as OrderTrackingResult),
  status: 'sent',
  status_display: 'ارسال شده',
  delivered_at: null,
}
const cancelled = live.cancelled.body.data as OrderTrackingResult

const items = () =>
  within(screen.getByRole('list', { name: 'مراحل سفارش' })).getAllByRole('listitem')

describe('OrderProgress', () => {
  it('status sent: the steps up to «ارسال شده» are done, it is the current one, delivery to come', () => {
    render(<OrderProgress progress={progressFromTracking(sent)} />)
    const steps = items()
    expect(steps.map((step) => step.querySelector('[data-step-label]')?.textContent)).toEqual([
      'در انتظار پرداخت',
      'در حال انجام',
      'بسته\u{200C}بندی',
      'ارسال شده',
      'تکمیل شده',
    ])
    for (const step of steps.slice(0, 3)) expect(step).toHaveTextContent('انجام شده')
    expect(steps[3]).toHaveTextContent('مرحلهٔ کنونی')
    expect(steps[3]).toHaveAttribute('aria-current', 'step')
    expect(steps[4]).toHaveTextContent('پیش رو')
    expect(steps[4]).not.toHaveAttribute('aria-current')
    // Reached steps carry their date (the stamp), Jalali; the one to come none.
    expect(steps[3]!.querySelector('time')).toHaveAttribute('dateTime', sent.dispatched_at)
    expect(steps[3]).toHaveTextContent('۱۸ مرداد ۱۴۰۵')
    expect(steps[4]!.querySelector('time')).toBeNull()
  })

  it('cancelled: a distinct ending, said in words, nothing upcoming after it', () => {
    render(<OrderProgress progress={progressFromTracking(cancelled)} />)
    const steps = items()
    expect(steps).toHaveLength(2)
    const ending = steps[1]!
    expect(ending).toHaveAttribute('data-terminal', '')
    expect(ending).toHaveAttribute('aria-current', 'step')
    expect(ending).toHaveTextContent('لغو شده')
    expect(ending).toHaveTextContent('پایان سفارش')
    expect(ending).not.toHaveTextContent('مرحلهٔ کنونی')
    expect(steps[0]).toHaveTextContent('انجام شده')
    expect(screen.queryByText('پیش رو')).toBeNull()
  })

  it('draws the server’s steps exactly as sent (the account’s order)', () => {
    const detail = delivered.data as OrderDetail
    render(<OrderProgress progress={progressFromServer(detail.progress)} />)
    const steps = items()
    expect(steps).toHaveLength(detail.progress.steps.length)
    expect(steps.map((step) => step.querySelector('[data-step-label]')?.textContent)).toEqual(
      detail.progress.steps.map((step) => step.label),
    )
    expect(steps.at(-1)).toHaveAttribute('aria-current', 'step')
    expect(steps.at(-1)).not.toHaveAttribute('data-terminal')
  })
})
