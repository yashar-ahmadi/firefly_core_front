import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Price } from '@/components/ui/price'
import { Rating } from '@/components/ui/rating'

describe('Price', () => {
  it('shows the amount in Toman, the struck original and the discount pill', () => {
    const { container } = render(<Price amount={900000} original={1000000} discountPercent={10} />)
    expect(container).toHaveTextContent('۹۰۰٬۰۰۰ تومان')
    expect(container).toHaveTextContent('۱۰٪')
    const original = container.querySelector('del')
    expect(original).not.toBeNull()
    expect(original).toHaveTextContent('۱٬۰۰۰٬۰۰۰')
  })

  it('computes the discount percent when it is not given', () => {
    const { container } = render(<Price amount={750000} original={1000000} />)
    expect(container).toHaveTextContent('۲۵٪')
  })

  it('shows no original or pill when there is no discount', () => {
    const { container } = render(<Price amount={1000000} original={1000000} />)
    expect(container.querySelector('del')).toBeNull()
    expect(container).not.toHaveTextContent('٪')
    expect(container).toHaveTextContent('۱٬۰۰۰٬۰۰۰ تومان')
  })

  it('renders «ناموجود» when the amount is null', () => {
    const { container } = render(<Price amount={null} original={1000000} />)
    expect(screen.getByText('ناموجود')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('تومان')
  })
})

describe('Rating', () => {
  it('labels the stars with the score using the Persian decimal separator', () => {
    render(<Rating value={4.5} count={128} />)
    expect(screen.getByRole('img', { name: 'امتیاز ۴٫۵ از ۵' })).toBeInTheDocument()
    expect(screen.getByText(/۱۲۸/)).toBeInTheDocument()
  })

  it('keeps the same label in the compact one-star form', () => {
    render(<Rating value={4.25} count={9} compact />)
    expect(screen.getByRole('img', { name: 'امتیاز ۴٫۳ از ۵' })).toBeInTheDocument()
  })

  it('clamps and rounds the value to one decimal', () => {
    render(<Rating value={7.26} />)
    expect(screen.getByRole('img', { name: 'امتیاز ۵ از ۵' })).toBeInTheDocument()
  })
})
