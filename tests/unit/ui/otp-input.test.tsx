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

  it('keeps the LTR digit group inside an RTL-flowing wrapper, at the start like its label', () => {
    render(<OtpInput value="" onChange={() => {}} className="justify-center" />)
    const group = screen.getByRole('group')
    expect(group).toHaveAttribute('dir', 'ltr')
    expect(group).toHaveClass('inline-flex')
    const wrapper = group.parentElement!
    expect(wrapper).not.toHaveAttribute('dir')
    expect(wrapper).toHaveClass('flex', 'justify-center')
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

  it('keeps the tab stop on the box the arrows moved to, so Tab leaves the group at once', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Harness />
        <button type="button">تأیید</button>
      </>,
    )
    await user.click(screen.getByLabelText('رقم ۱'))
    await user.keyboard('123')
    expect(screen.getByLabelText('رقم ۴')).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByLabelText('رقم ۲')).toHaveFocus()
    expect(screen.getByLabelText('رقم ۲')).toHaveAttribute('tabindex', '0')
    expect(screen.getByLabelText('رقم ۴')).toHaveAttribute('tabindex', '-1')
    // No second stop at the first empty box on the way out.
    await user.tab()
    expect(screen.getByRole('button', { name: 'تأیید' })).toHaveFocus()
    // Back in: the group's stop is the first empty box again.
    await user.tab({ shift: true })
    expect(screen.getByLabelText('رقم ۴')).toHaveFocus()
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
