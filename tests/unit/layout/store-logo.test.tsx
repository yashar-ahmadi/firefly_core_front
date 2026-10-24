import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StoreLogo } from '@/components/layout/store-logo'

// The header's and footer's logo link: a 44 px tall target (the spec's touch floor; it was 40),
// the picture itself still drawn 40 px tall inside it.

describe('StoreLogo', () => {
  it('is a 44 px tall link home, its picture inset to 40 px', () => {
    render(<StoreLogo src="https://api.shop.ir/media/logo.png" name="فایرفلای" />)
    const link = screen.getByRole('link', { name: 'فایرفلای' })
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveClass('h-11', 'py-0.5')
    expect(link).not.toHaveClass('h-10')
  })

  it('so is the wordmark without a picture', () => {
    render(<StoreLogo src={null} name="فایرفلای" />)
    expect(screen.getByRole('link', { name: 'فایرفلای' })).toHaveClass('h-11')
  })
})
