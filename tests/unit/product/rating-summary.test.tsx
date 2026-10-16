import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RatingSummary } from '@/features/product/components/reviews/rating-summary'
import { s25Product } from './fixtures'

describe('RatingSummary', () => {
  it('shows the average, the count and one bar per score from 5 to 1, each naming its count', () => {
    const product = s25Product()
    render(<RatingSummary product={product} />)
    expect(screen.getByRole('img', { name: 'امتیاز ۴ از ۵' })).toBeInTheDocument()
    expect(screen.getByText('بر اساس ۳ امتیاز')).toBeInTheDocument()
    const bars = within(screen.getByRole('list', { name: 'امتیازها' })).getAllByRole('img')
    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
      '۵ ستاره: ۱ نفر',
      '۴ ستاره: ۱ نفر',
      '۳ ستاره: ۱ نفر',
      '۲ ستاره: ۰ نفر',
      '۱ ستاره: ۰ نفر',
    ])
    // The fill follows the percent the API rounded.
    expect(bars[0]!.firstElementChild).toHaveStyle({ width: '33%' })
    expect(bars[4]!.firstElementChild).toHaveStyle({ width: '0%' })
  })

  it('invites the first review when nothing is rated yet', () => {
    const product = s25Product({ rating: 0, rating_count: 0 })
    render(<RatingSummary product={product} />)
    expect(screen.getByText('هنوز امتیازی ثبت نشده است.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'امتیازها' })).toBeNull()
  })
})
