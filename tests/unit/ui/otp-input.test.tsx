import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from '@/components/ui/otp-input'

function Harness({ onComplete = vi.fn(), length }: { onComplete?: () => void; length?: number }) {
  const [value, setValue] = useState('')
  return <OtpInput length={length} value={value} onChange={setValue} onComplete={onComplete} />
}

describe('OtpInput', () => {
  it('renders one labelled numeric box per digit in left-to-right order', () => {
    render(<Harness length={4} />)
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(4)
    expect(boxes[0]).toHaveAccessibleName('رقم ۱')
    expect(boxes[3]).toHaveAccessibleName('رقم ۴')
    expect(boxes[0]).toHaveAttribute('inputmode', 'numeric')
    expect(boxes[0]).toHaveAttribute('autocomplete', 'one-time-code')
    expect(screen.getByRole('group')).toHaveAttribute('dir', 'ltr')
  })

  it('fills every box from a pasted Persian code and completes with Latin digits', async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onComplete={onComplete} />)
    await user.click(screen.getByLabelText('رقم ۱'))
    await user.paste('۱۲۳۴۵۶')
    expect(onComplete).toHaveBeenCalledWith('123456')
    expect(screen.getByLabelText('رقم ۶')).toHaveValue('۶')
  })

  it('lets Tab leave an incomplete group: only the active box is in the tab order', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Harness />
        <button type="button">تأیید</button>
      </>,
    )
    const boxes = screen.getAllByRole('textbox')
    expect(boxes.map((box) => box.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
      '-1',
    ])
    await user.tab()
    expect(boxes[0]).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'تأیید' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(boxes[0]).toHaveFocus()
  })

  it('moves the tab stop to the first empty box and redirects a click on a later box there', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('رقم ۱'))
    await user.keyboard('12')
    expect(screen.getByLabelText('رقم ۳')).toHaveAttribute('tabindex', '0')
    expect(screen.getByLabelText('رقم ۱')).toHaveAttribute('tabindex', '-1')
    await user.click(screen.getByLabelText('رقم ۶'))
    expect(screen.getByLabelText('رقم ۳')).toHaveFocus()
  })

  it('calls onComplete only when the completed code changes', async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onComplete={onComplete} />)
    await user.click(screen.getByLabelText('رقم ۱'))
    await user.paste('123456')
    await user.paste('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
    await user.paste('654321')
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith('654321')
  })

  it('advances on typing, accepts Arabic-Indic digits and moves back on Backspace', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('رقم ۱'))
    await user.keyboard('٣')
    expect(screen.getByLabelText('رقم ۱')).toHaveValue('۳')
    expect(screen.getByLabelText('رقم ۲')).toHaveFocus()
    await user.keyboard('x')
    expect(screen.getByLabelText('رقم ۲')).toHaveValue('')
    await user.keyboard('{Backspace}')
    expect(screen.getByLabelText('رقم ۱')).toHaveFocus()
    expect(screen.getByLabelText('رقم ۱')).toHaveValue('')
  })
})
