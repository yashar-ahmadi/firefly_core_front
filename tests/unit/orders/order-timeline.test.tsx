import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderTimeline } from '@/features/orders/components/order-timeline'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import delivered from '../../fixtures/order-detail-delivered.json'
import returned from '../../fixtures/order-detail-returned.json'

// The order's history (order digest §6.4 `timeline`, live OrderDetail fixtures): every row as the
// API sent it, oldest first, in its own words (`to_status_display`) with its moment (Jalali,
// Tehran time). For the account's order page (Task 8); tracking has no timeline.

const detail = (fixture: { data: unknown }) => fixture.data as OrderDetail
const rows = () =>
  within(screen.getByRole('list', { name: 'تاریخچهٔ سفارش' })).getAllByRole('listitem')

describe('OrderTimeline', () => {
  it('every entry in the API’s order and words, each with its moment', () => {
    const { timeline } = detail(delivered)
    render(<OrderTimeline timeline={timeline} />)
    expect(screen.getByRole('heading', { name: 'تاریخچهٔ سفارش' })).toBeVisible()
    const shown = rows()
    expect(shown.map((row) => row.querySelector('[data-entry-label]')?.textContent)).toEqual(
      timeline.map((entry) => entry.to_status_display),
    )
    expect(shown.map((row) => row.querySelector('time')?.getAttribute('dateTime'))).toEqual(
      timeline.map((entry) => entry.created),
    )
    // 2026-08-08 17:00 in Tehran.
    expect(shown[0]).toHaveTextContent('۱۷ مرداد ۱۴۰۵، ساعت ۱۷:۰۰')
  })

  it('an order that ended: its ending is the last row, as sent', () => {
    const { timeline } = detail(returned)
    render(<OrderTimeline timeline={timeline} />)
    expect(rows()).toHaveLength(timeline.length)
    expect(rows().at(-1)).toHaveTextContent('مسترد شده')
  })

  it('a heading level of the page’s choosing', () => {
    render(<OrderTimeline timeline={detail(delivered).timeline} headingLevel={3} />)
    expect(screen.getByRole('heading', { level: 3, name: 'تاریخچهٔ سفارش' })).toBeVisible()
  })

  it('no history: nothing at all', () => {
    const { container } = render(<OrderTimeline timeline={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
