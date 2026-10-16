import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { IconButton } from '@/components/ui/icon-button'

describe('Button', () => {
  it('is a non-submitting button by default', () => {
    render(<Button>ادامه</Button>)
    expect(screen.getByRole('button', { name: 'ادامه' })).toHaveAttribute('type', 'button')
  })

  it('is disabled and busy while loading, and keeps its accessible name', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        ثبت سفارش
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'ثبت سفارش' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders its child element instead of a button with asChild', () => {
    render(
      <Button asChild variant="outline">
        <a href="/cart/">سبد خرید</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'سبد خرید' })
    expect(link).toHaveAttribute('href', '/cart/')
    expect(link.className).toContain('border')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('marks an asChild element busy and disabled while loading', () => {
    const { rerender } = render(
      <Button asChild loading>
        <a href="/checkout/">پرداخت</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'پرداخت' })
    expect(link).toHaveAttribute('aria-busy', 'true')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    rerender(
      <Button asChild disabled>
        <a href="/checkout/">پرداخت</a>
      </Button>,
    )
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).not.toHaveAttribute('aria-busy')
  })

  it('dims a disabled asChild element, which cannot use the :disabled state', () => {
    render(
      <Button asChild disabled>
        <a href="/checkout/">پرداخت</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'پرداخت' })).toHaveClass('aria-disabled:opacity-50')
  })

  it('gives the link variant a 44px hit area without changing its layout', () => {
    expect(buttonClasses({ variant: 'link' })).toContain('after:h-11')
    expect(buttonClasses({ variant: 'link', size: 'sm' })).toContain('after:h-11')
  })

  it('forwards className', () => {
    render(<Button className="custom-x">ارسال</Button>)
    expect(screen.getByRole('button')).toHaveClass('custom-x')
  })
})

describe('IconButton', () => {
  it('uses its label as the accessible name', () => {
    render(<IconButton label="افزودن به علاقه‌مندی‌ها" icon={<svg />} />)
    expect(screen.getByRole('button', { name: 'افزودن به علاقه‌مندی‌ها' })).toBeInTheDocument()
  })
})
