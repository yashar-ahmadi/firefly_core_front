import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuantityStepper } from '@/components/ui/quantity-stepper'

describe('QuantityStepper', () => {
  it('disables plus at max', () => {
    render(<QuantityStepper value={2} max={2} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeDisabled()
  })

  it('treats max 0 and null as unlimited', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<QuantityStepper value={40} max={0} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    expect(onChange).toHaveBeenLastCalledWith(41)
    rerender(<QuantityStepper value={40} max={null} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeEnabled()
  })

  it('shows the value with Persian digits and decrements above min', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={3} onChange={onChange} />)
    expect(screen.getByText('۳')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'کاهش تعداد' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('turns minus into a remove button at min when onRemove is given', async () => {
    const onRemove = vi.fn()
    const onChange = vi.fn()
    render(<QuantityStepper value={1} onChange={onChange} onRemove={onRemove} />)
    expect(screen.queryByRole('button', { name: 'کاهش تعداد' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'حذف' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables minus at min without onRemove', () => {
    render(<QuantityStepper value={1} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'کاهش تعداد' })).toBeDisabled()
  })

  it('disables both buttons while loading', () => {
    render(<QuantityStepper value={2} onChange={vi.fn()} loading />)
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'کاهش تعداد' })).toBeDisabled()
  })
})
