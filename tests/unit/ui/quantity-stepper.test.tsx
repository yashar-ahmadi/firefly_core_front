import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuantityStepper } from '@/components/ui/quantity-stepper'

// A button the stepper cannot use now (at a limit, or while the cart saves) says so with
// `aria-disabled` and ignores presses, but keeps its focus: a `disabled` button that held the
// focus dropped it to the page (Plan 5 Task 8's keyboard check: «افزایش» pressed from the
// keyboard on the cart page left the focus on <body> while the cart saved).
const unavailable = (button: HTMLElement) => {
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(button).not.toBeDisabled()
}

describe('QuantityStepper', () => {
  it('plus is unavailable at max', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={2} max={2} onChange={onChange} />)
    const plus = screen.getByRole('button', { name: 'افزایش تعداد' })
    unavailable(plus)
    await userEvent.click(plus)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('treats max 0 and null as unlimited', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<QuantityStepper value={40} max={0} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    expect(onChange).toHaveBeenLastCalledWith(41)
    rerender(<QuantityStepper value={40} max={null} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).not.toHaveAttribute(
      'aria-disabled',
    )
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

  it('minus is unavailable at min without onRemove', () => {
    render(<QuantityStepper value={1} onChange={vi.fn()} />)
    unavailable(screen.getByRole('button', { name: 'کاهش تعداد' }))
  })

  it('both buttons are unavailable while loading, and ignore presses', async () => {
    const onChange = vi.fn()
    const onRemove = vi.fn()
    const { rerender } = render(<QuantityStepper value={2} onChange={onChange} loading />)
    for (const name of ['افزایش تعداد', 'کاهش تعداد']) {
      unavailable(screen.getByRole('button', { name }))
      await userEvent.click(screen.getByRole('button', { name }))
    }
    rerender(<QuantityStepper value={1} onChange={onChange} onRemove={onRemove} loading />)
    unavailable(screen.getByRole('button', { name: 'حذف' }))
    await userEvent.click(screen.getByRole('button', { name: 'حذف' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('a press from the keyboard keeps the focus on its button while the cart saves', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<QuantityStepper value={1} onChange={onChange} />)
    const plus = screen.getByRole('button', { name: 'افزایش تعداد' })
    plus.focus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(2)
    // The cart saves: the buttons wait, the focus stays.
    rerender(<QuantityStepper value={2} onChange={onChange} loading />)
    expect(plus).toHaveFocus()
    rerender(<QuantityStepper value={2} onChange={onChange} />)
    expect(plus).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(3)
  })
})
