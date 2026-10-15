import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pagination, pageItems } from '@/components/ui/pagination'

const hrefFor = (p: number) => `/category/phones/?page=${p}`

describe('Pagination', () => {
  it('links to the previous and next pages with rel attributes', () => {
    render(<Pagination page={2} totalPages={5} hrefFor={hrefFor} />)
    const prev = screen.getByRole('link', { name: 'صفحه قبلی' })
    expect(prev).toHaveAttribute('href', hrefFor(1))
    expect(prev).toHaveAttribute('rel', 'prev')
    const next = screen.getByRole('link', { name: 'صفحه بعدی' })
    expect(next).toHaveAttribute('href', hrefFor(3))
    expect(next).toHaveAttribute('rel', 'next')
  })

  it('marks the current page and labels page links with Persian digits', () => {
    render(<Pagination page={2} totalPages={5} hrefFor={hrefFor} />)
    expect(screen.getByRole('link', { name: 'صفحه ۲' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'صفحه ۵' })).toHaveAttribute('href', hrefFor(5))
    expect(screen.getByRole('navigation')).toHaveTextContent('۲ از ۵')
  })

  it('has no previous link on the first page and no next link on the last', () => {
    const { rerender } = render(<Pagination page={1} totalPages={3} hrefFor={hrefFor} />)
    expect(screen.queryByRole('link', { name: 'صفحه قبلی' })).toBeNull()
    rerender(<Pagination page={3} totalPages={3} hrefFor={hrefFor} />)
    expect(screen.queryByRole('link', { name: 'صفحه بعدی' })).toBeNull()
  })

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} hrefFor={hrefFor} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('pageItems', () => {
  it('lists every page when there are few', () => {
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('collapses distant ranges into ellipses around the current page', () => {
    expect(pageItems(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
  })

  it('shows a single hidden page instead of an ellipsis', () => {
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20])
    expect(pageItems(1, 20)).toEqual([1, 2, 'ellipsis', 20])
  })
})
